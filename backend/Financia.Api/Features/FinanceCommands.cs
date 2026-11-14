using System.Data;
using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Features;

internal sealed record CommandOutcome(int StatusCode, object Body);
internal sealed record FinanceCommandContext(NormalizedFinanceDb Db, Guid UserId, FinanceAccount Account,
    DateTime Now, string Revision, CancellationToken CancellationToken);

internal static partial class FinanceCommands
{
    internal const decimal MaximumAmount = 999999999999.99m;
    internal static string Number(long value) => value.ToString(CultureInfo.InvariantCulture);
    internal static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
    internal static string Timestamp(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("O", CultureInfo.InvariantCulture);
    internal static bool TryAmount(string? value, out decimal amount)
    {
        amount = 0;
        return value is not null && DecimalAmount().IsMatch(value)
            && decimal.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out amount)
            && amount > 0 && amount <= MaximumAmount;
    }
    internal static bool TryVersion(string? value, out long version) =>
        long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out version) && version > 0;

    internal static async Task<IResult> Execute(object request, HttpRequest http, ClaimsPrincipal user,
        NormalizedFinanceDb db, string operation, Func<FinanceCommandContext, Task<CommandOutcome>> apply, CancellationToken ct)
    {
        var key = NormalizedFinances.IdempotencyKey(http);
        if (key is null) return Results.BadRequest(new { error = "Envía una Idempotency-Key única de hasta 128 caracteres." });
        var owner = Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var hash = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(request, FinanceDb.JsonOptions)));
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var receipt = await db.Receipts.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == owner && x.Key == key, ct);
        if (receipt is not null)
        {
            if (receipt.Operation != operation || receipt.RequestHash != hash)
                return Results.Conflict(new { error = "Esta clave de idempotencia ya se utilizó para otra solicitud." });
            await transaction.CommitAsync(ct);
            return Results.Content(receipt.ResponseJson, "application/json", statusCode: receipt.StatusCode);
        }
        var account = await db.Accounts.SingleOrDefaultAsync(x => x.UserId == owner, ct);
        if (account is null) return Results.Conflict(new { error = "Primero inicializa o importa esta cuenta mediante /api/v2/imports/legacy." });
        if (account.ImportKey == key) return Results.Conflict(new { error = "Esta clave ya se utilizó para importar el historial." });
        if (account.Revision == long.MaxValue) return Results.Conflict(new { error = "La revisión de la cuenta alcanzó el límite admitido." });
        account.ImportResponseJson ??= JsonSerializer.Serialize(await NormalizedFinances.Read(db, owner, ct), FinanceDb.JsonOptions);
        var now = DateTime.UtcNow;
        var outcome = await apply(new(db, owner, account, now, Number(account.Revision + 1), ct));
        if (outcome.StatusCode < 200 || outcome.StatusCode >= 300)
            return Results.Json(outcome.Body, statusCode: outcome.StatusCode);
        account.Revision++;
        var json = JsonSerializer.Serialize(outcome.Body, FinanceDb.JsonOptions);
        db.Receipts.Add(new CommandReceipt { UserId = owner, Key = key, Operation = operation, RequestHash = hash,
            ResponseJson = json, StatusCode = outcome.StatusCode, CreatedAt = now });
        db.Outbox.Add(new FinanceOutbox { EventId = Guid.NewGuid(), UserId = owner, Revision = account.Revision, CreatedAt = now });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Content(json, "application/json", statusCode: outcome.StatusCode);
    }

    [GeneratedRegex(@"^[0-9]+(?:\.[0-9]{1,2})?$", RegexOptions.CultureInvariant)]
    private static partial Regex DecimalAmount();
}
