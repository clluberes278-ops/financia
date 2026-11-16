using System.Data;
using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Financia.Api.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Financia.Api.Contracts;

namespace Financia.Api.Features;

public sealed record LegacyPocket(string Id, string Name, string Currency, decimal TargetAmount,
    decimal CurrentAmount, string Emoji, string CreatedAt, string? Color = null);
public sealed record LegacySnapshot(int Version, Movement[] Transactions, LegacyPocket[] Pockets);
public sealed record ImportLegacyRequest(string ExpectedRevision, LegacySnapshot? Snapshot = null, string? LegacyRevision = null);
public sealed record V2Movement(string Id, string Currency, string Amount, string Type, string Category,
    string Date,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Note,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? PocketId,
    string Version);
public sealed record V2Pocket(string Id, string Name, string Currency, string TargetAmount, string CurrentAmount,
    string Emoji, string CreatedAt,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Color,
    string Version);
public sealed record V2Snapshot(int Version, V2Movement[] Transactions, V2Pocket[] Pockets);
public sealed record V2FinanceResponse(string Revision, V2Snapshot Snapshot);

public static class NormalizedFinances
{
    public static bool Enabled(IConfiguration config) => config.GetValue<bool>("FinanceV2:Enabled");

    // Legacy guards remain active after a rollout flag is switched off. Query metadata
    // without provoking a missing-table error inside a PostgreSQL transaction.
    public static async Task<bool> HasStorage(NormalizedFinanceDb db, CancellationToken ct)
    {
        var connection = db.Database.GetDbConnection();
        var opened = connection.State != ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = db.Database.IsNpgsql()
                ? "SELECT to_regclass('financia.finance_accounts') IS NOT NULL"
                : "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'finance_accounts')";
            return Convert.ToBoolean(await command.ExecuteScalarAsync(ct), CultureInfo.InvariantCulture);
        }
        finally { if (opened) await connection.CloseAsync(); }
    }

    public static void MapNormalizedFinances(this WebApplication app)
    {
        var routes = app.MapGroup("/api/v2").RequireAuthorization();
        routes.AddEndpointFilter(async (context, next) => {
            try { return await next(context); }
            catch (Exception error) when (IsWriteConflict(error))
            {
                return Results.Conflict(new { error = "Los datos cambiaron durante la operación. Recarga y vuelve a intentarlo con la misma clave." });
            }
        });
        routes.MapGet("/finances", async (ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct) => {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var result = await Read(db, Owner(user), ct);
            await transaction.CommitAsync(ct);
            return Results.Ok(result);
        }).WithFinanceContract("getFinances");
        routes.MapPost("/imports/legacy", Import).WithFinanceContract("importLegacy");
        routes.MapMovementCommands();
        routes.MapFinanceCollectionCommands();
        routes.MapBankImportCommands();
        routes.MapPocketCommands();
    }

    public static bool IsWriteConflict(Exception error) => error switch {
        DbUpdateConcurrencyException => true,
        PostgresException postgres => postgres.SqlState is "40001" or "40P01" or "23505",
        SqliteException sqlite => sqlite.SqliteErrorCode is 5 or 6 || sqlite.SqliteExtendedErrorCode is 1555 or 2067,
        _ => error.InnerException is not null && IsWriteConflict(error.InnerException)
    };

    private static Guid Owner(ClaimsPrincipal user) => Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private static string Number(long value) => value.ToString(CultureInfo.InvariantCulture);
    private static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
    // SQLite drops DateTime.Kind on reads; all persisted timestamps are UTC.
    private static string Timestamp(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("O", CultureInfo.InvariantCulture);

    internal static V2Movement ToResponse(NormalizedMovement m) => new(m.Id, m.Currency, Money(m.Amount), m.Type, m.Category,
        Timestamp(m.OccurredAt), m.Note, m.PocketId, Number(m.Version));

    internal static V2Pocket ToResponse(NormalizedPocket p) => new(p.Id, p.Name, p.Currency, Money(p.TargetAmount), Money(p.CurrentAmount),
        p.Emoji, Timestamp(p.CreatedAt), p.Color, Number(p.Version));

    internal static string? IdempotencyKey(HttpRequest http)
    {
        var values = http.Headers["Idempotency-Key"];
        var key = values.ToString();
        return values.Count == 1 && !string.IsNullOrWhiteSpace(key) && key.Length <= 128 && key.Trim() == key ? key : null;
    }

    internal static async Task<V2FinanceResponse> Read(NormalizedFinanceDb db, Guid owner, CancellationToken ct)
    {
        var account = await db.Accounts.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == owner, ct);
        if (account is null) return new("0", new(2, [], []));
        var movements = await db.Movements.AsNoTracking().Where(x => x.UserId == owner && x.DeletedAt == null).OrderBy(x => x.Id).ToArrayAsync(ct);
        var pockets = await db.Pockets.AsNoTracking().Where(x => x.UserId == owner && x.ClosedAt == null).OrderBy(x => x.Id).ToArrayAsync(ct);
        return new(Number(account.Revision), new(2,
            movements.Select(ToResponse).ToArray(),
            pockets.Select(ToResponse).ToArray()));
    }

    private static async Task<IResult> Import(ImportLegacyRequest request, HttpRequest http,
        ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct)
    {
        var key = IdempotencyKey(http);
        if (key is null)
            return Results.BadRequest(new { error = "Envía una Idempotency-Key única de hasta 128 caracteres." });
        if (request.ExpectedRevision != "0")
            return Results.Conflict(new { error = "La importación requiere una cuenta v2 vacía (expectedRevision: 0)." });
        var owner = Owner(user);
        var hash = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(request, FinanceDb.JsonOptions)));
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var existing = await db.Accounts.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == owner, ct);
        if (existing is not null)
        {
            if (existing.ImportKey != key || existing.ImportHash != hash)
                return Results.Conflict(new { error = "La cuenta ya fue importada o la clave corresponde a otra solicitud." });
            // Preserve the original response even after newer movements have been written.
            var previousJson = existing.ImportResponseJson ?? JsonSerializer.Serialize(await Read(db, owner, ct), FinanceDb.JsonOptions);
            await transaction.CommitAsync(ct);
            return Results.Content(previousJson, "application/json");
        }
        var original = await db.LegacyDocuments.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerId == owner, ct);
        LegacySnapshot? snapshot;
        if (original is not null)
        {
            if (request.Snapshot is not null || request.LegacyRevision != Number(original.Revision))
                return Results.Conflict(new { error = "Existe un historial en el servidor. Importa desde él con su legacyRevision actual y sin enviar snapshot." });
            try { snapshot = JsonSerializer.Deserialize<LegacySnapshot>(original.Json, FinanceDb.JsonOptions); }
            catch (JsonException) { return Results.BadRequest(new { error = "El historial original no se puede interpretar. Se conservó intacto." }); }
        }
        else
        {
            if (request.LegacyRevision is not null)
                return Results.Conflict(new { error = "No existe esa revisión del historial del servidor." });
            snapshot = request.Snapshot;
        }
        if (snapshot is null || snapshot.Pockets is null || snapshot.Transactions is null || snapshot.Pockets.Any(p => p is null))
            return Results.BadRequest(new { error = "Falta un historial válido para importar." });
        var legacy = new FinancialSnapshot(snapshot.Version, snapshot.Transactions,
            snapshot.Pockets.Select(p => new Pocket(p.Id, p.Name, p.Currency, p.TargetAmount, p.CurrentAmount, p.Emoji, p.CreatedAt)).ToArray());
        var validation = legacy.Validate();
        if (validation is not null) return Results.BadRequest(new { error = validation });
        if (snapshot.Pockets.Any(p => p.Color?.Length > 64))
            return Results.BadRequest(new { error = "El color de un bolsillo supera el límite permitido." });

        var pocketsById = snapshot.Pockets.ToDictionary(p => p.Id, StringComparer.Ordinal);
        var unresolved = snapshot.Transactions.Where(m => m.PocketId is not null && !pocketsById.ContainsKey(m.PocketId))
            .Select(m => m.Id).ToArray();
        if (unresolved.Length > 0)
            return Results.BadRequest(new { error = "Hay transferencias con bolsillos históricos ausentes. Resuelve las referencias antes de importar; el original se conserva.", movementIds = unresolved });
        if (snapshot.Transactions.Any(m => m.PocketId is not null && pocketsById[m.PocketId].Currency != m.Currency))
            return Results.BadRequest(new { error = "Una transferencia y su bolsillo tienen monedas diferentes." });
        // Convert only timestamps; amounts, IDs and pocket balances are preserved exactly.
        if (snapshot.Transactions.Any(m => !TryUtc(m.Date, out _)) || snapshot.Pockets.Any(p => !TryUtc(p.CreatedAt, out _)))
            return Results.BadRequest(new { error = "Las fechas deben incluir una zona horaria explícita y ser válidas." });
        db.Accounts.Add(new FinanceAccount { UserId = owner, Revision = 1, ImportKey = key, ImportHash = hash, LegacyRevision = original?.Revision });
        db.Pockets.AddRange(snapshot.Pockets.Select(p => {
            TryUtc(p.CreatedAt, out var createdAt);
            return new NormalizedPocket { UserId = owner, Id = p.Id, Name = p.Name, Currency = p.Currency,
                TargetAmount = p.TargetAmount, CurrentAmount = p.CurrentAmount, Emoji = p.Emoji, Color = p.Color,
                CreatedAt = createdAt, Version = 1 };
        }));
        db.Movements.AddRange(snapshot.Transactions.Select(m => {
            TryUtc(m.Date, out var occurredAt);
            return new NormalizedMovement { UserId = owner, Id = m.Id, Currency = m.Currency, Amount = m.Amount,
                Type = m.Type, Category = m.Category, Note = m.Note, PocketId = m.PocketId, OccurredAt = occurredAt, Version = 1 };
        }));
        await db.SaveChangesAsync(ct);
        var response = await Read(db, owner, ct);
        var account = await db.Accounts.SingleAsync(x => x.UserId == owner, ct);
        account.ImportResponseJson = JsonSerializer.Serialize(response, FinanceDb.JsonOptions);
        db.Outbox.Add(new FinanceOutbox { EventId = Guid.NewGuid(), UserId = owner, Revision = 1, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Ok(response);
    }

    internal static bool TryUtc(string value, out DateTime utc)
    {
        utc = default;
        // Avoid interpreting zone-less historical dates in the server's local time zone.
        var hasZone = value.EndsWith('Z') || (value.Length >= 6 && value[^3] == ':' && (value[^6] is '+' or '-'));
        if (!hasZone || !DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)) return false;
        utc = parsed.UtcDateTime;
        return true;
    }
}
