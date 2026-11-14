using System.Data;
using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Features;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateMovementRequest(string Id, string Currency, string Amount, string Type,
    string Category, string Date, string? Note = null);
public sealed record CreateMovementResponse(string Revision, V2Movement Movement);

public static partial class MovementCommands
{
    private const string Operation = "movement.create";

    public static void MapMovementCommands(this RouteGroupBuilder routes) => routes.MapPost("/movements", Create);

    private static async Task<IResult> Create(CreateMovementRequest request, HttpRequest http,
        ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct)
    {
        var key = NormalizedFinances.IdempotencyKey(http);
        if (key is null) return Results.BadRequest(new { error = "Envía una Idempotency-Key única de hasta 128 caracteres." });
        if (request.Amount is null || !DecimalAmount().IsMatch(request.Amount)
            || !decimal.TryParse(request.Amount, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var amount))
            return Results.BadRequest(new { error = "El importe debe ser una cadena decimal positiva, sin separador de miles y con un máximo de dos decimales." });
        var movement = new Movement(request.Id, request.Currency, amount, request.Type, request.Category, request.Date, request.Note, null);
        var validation = new FinancialSnapshot(1, [movement], []).Validate();
        if (validation is not null) return Results.BadRequest(new { error = validation });
        if (!NormalizedFinances.TryUtc(request.Date, out var occurredAt))
            return Results.BadRequest(new { error = "La fecha debe ser válida e incluir una zona horaria explícita." });
        var owner = Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var hash = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(request, FinanceDb.JsonOptions)));
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var receipt = await db.Receipts.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == owner && x.Key == key, ct);
        if (receipt is not null)
        {
            if (receipt.Operation != Operation || receipt.RequestHash != hash)
                return Results.Conflict(new { error = "Esta clave de idempotencia ya se utilizó para otra solicitud." });
            await transaction.CommitAsync(ct);
            return Results.Content(receipt.ResponseJson, "application/json", statusCode: receipt.StatusCode);
        }
        var account = await db.Accounts.SingleOrDefaultAsync(x => x.UserId == owner, ct);
        if (account is null)
            return Results.Conflict(new { error = "Primero inicializa o importa esta cuenta mediante /api/v2/imports/legacy." });
        if (account.ImportKey == key)
            return Results.Conflict(new { error = "Esta clave ya se utilizó para importar el historial." });
        if (account.Revision == long.MaxValue)
            return Results.Conflict(new { error = "La revisión de la cuenta alcanzó el límite admitido." });
        if (await db.Movements.AsNoTracking().AnyAsync(x => x.UserId == owner && x.Id == request.Id, ct))
            return Results.Conflict(new { error = "Ya existe un movimiento con ese identificador." });
        // Upgrade accounts imported before receipts existed, while their original state is still intact.
        account.ImportResponseJson ??= JsonSerializer.Serialize(await NormalizedFinances.Read(db, owner, ct), FinanceDb.JsonOptions);
        account.Revision++;
        var entity = new NormalizedMovement { UserId = owner, Id = movement.Id, Currency = movement.Currency,
            Amount = amount, Type = movement.Type, Category = movement.Category, Note = movement.Note,
            OccurredAt = occurredAt, Version = 1 };
        db.Movements.Add(entity);
        var response = new CreateMovementResponse(account.Revision.ToString(CultureInfo.InvariantCulture), NormalizedFinances.ToResponse(entity));
        var json = JsonSerializer.Serialize(response, FinanceDb.JsonOptions);
        var now = DateTime.UtcNow;
        db.Receipts.Add(new CommandReceipt { UserId = owner, Key = key, Operation = Operation, RequestHash = hash,
            ResponseJson = json, StatusCode = StatusCodes.Status201Created, CreatedAt = now });
        db.Outbox.Add(new FinanceOutbox { EventId = Guid.NewGuid(), UserId = owner, Revision = account.Revision, CreatedAt = now });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Content(json, "application/json", statusCode: StatusCodes.Status201Created);
    }

    [GeneratedRegex(@"^\d+(?:\.\d{1,2})?$", RegexOptions.CultureInvariant)]
    private static partial Regex DecimalAmount();
}
