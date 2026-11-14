using System.Security.Claims;
using System.Text.Json.Serialization;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Features;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateMovementRequest(string Id, string Currency, string Amount, string Type,
    string Category, string Date, string? Note = null);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record UpdateMovementRequest(string ExpectedVersion, string Currency, string Amount, string Type,
    string Category, string Date, string? Note = null);
public sealed record CreateMovementResponse(string Revision, V2Movement Movement);

public static class MovementCommands
{
    public static void MapMovementCommands(this RouteGroupBuilder routes)
    {
        routes.MapPost("/movements", Create);
        routes.MapPatch("/movements/{id}", Update);
        routes.MapDelete("/movements/{id}", Delete);
    }

    private static string? Validate(CreateMovementRequest request, out decimal amount, out DateTime occurredAt)
    {
        occurredAt = default;
        if (!FinanceCommands.TryAmount(request.Amount, out amount))
            return "El importe debe ser una cadena decimal positiva con un máximo de dos decimales, sin separador de miles.";
        var movement = new Movement(request.Id, request.Currency, amount, request.Type, request.Category, request.Date, request.Note, null);
        var validation = new FinancialSnapshot(1, [movement], []).Validate();
        if (validation is not null) return validation;
        if (request.Category == "ahorro") return "Usa los comandos del bolsillo para registrar transferencias de ahorro.";
        return NormalizedFinances.TryUtc(request.Date, out occurredAt) ? null : "La fecha debe ser válida e incluir una zona horaria explícita.";
    }

    private static Task<IResult> Create(CreateMovementRequest request, HttpRequest http, ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct)
    {
        var error = Validate(request, out var amount, out var occurredAt);
        if (error is not null) return Task.FromResult<IResult>(Results.BadRequest(new { error }));
        return FinanceCommands.Execute(request, http, user, db, "movement.create", async context => {
            if (await db.Movements.AsNoTracking().AnyAsync(x => x.UserId == context.UserId && x.Id == request.Id, ct))
                return new(409, new { error = "Ya existe un movimiento con ese identificador." });
            var entity = new NormalizedMovement { UserId = context.UserId, Id = request.Id, Currency = request.Currency,
                Amount = amount, Type = request.Type, Category = request.Category, Note = request.Note, OccurredAt = occurredAt, Version = 1 };
            if (!await PreservesSavings(db, context.UserId, null, entity, ct))
                return new(409, new { error = "La operación dejaría sin respaldo el dinero reservado en bolsillos." });
            db.Movements.Add(entity);
            return new(201, new CreateMovementResponse(context.Revision, NormalizedFinances.ToResponse(entity)));
        }, ct);
    }

    private static Task<IResult> Update(string id, UpdateMovementRequest request, HttpRequest http, ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct)
    {
        if (!FinanceCommands.TryVersion(request.ExpectedVersion, out var expected))
            return Task.FromResult<IResult>(Results.BadRequest(new { error = "expectedVersion debe ser un entero positivo." }));
        var error = Validate(new(id, request.Currency, request.Amount, request.Type, request.Category, request.Date, request.Note), out var amount, out var occurredAt);
        if (error is not null) return Task.FromResult<IResult>(Results.BadRequest(new { error }));
        return FinanceCommands.Execute(new { id, request }, http, user, db, "movement.update", async context => {
            var entity = await db.Movements.SingleOrDefaultAsync(x => x.UserId == context.UserId && x.Id == id && x.DeletedAt == null, ct);
            var invalid = CanModify(entity, expected);
            if (invalid is not null) return invalid;
            var replacement = new NormalizedMovement { UserId = context.UserId, Id = id, Currency = request.Currency,
                Amount = amount, Type = request.Type, Category = request.Category, Note = request.Note, OccurredAt = occurredAt, Version = entity!.Version + 1 };
            if (!await PreservesSavings(db, context.UserId, entity, replacement, ct))
                return new(409, new { error = "La edición dejaría sin respaldo el dinero reservado en bolsillos." });
            entity!.Currency = replacement.Currency; entity.Amount = replacement.Amount; entity.Type = replacement.Type;
            entity.Category = replacement.Category; entity.Note = replacement.Note; entity.OccurredAt = replacement.OccurredAt;
            entity.Version++;
            return new(200, new CreateMovementResponse(context.Revision, NormalizedFinances.ToResponse(entity)));
        }, ct);
    }

    private static Task<IResult> Delete(string id, string? expectedVersion, HttpRequest http, ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct)
    {
        if (!FinanceCommands.TryVersion(expectedVersion, out var expected))
            return Task.FromResult<IResult>(Results.BadRequest(new { error = "expectedVersion debe ser un entero positivo." }));
        return FinanceCommands.Execute(new { id, expectedVersion }, http, user, db, "movement.delete", async context => {
            var entity = await db.Movements.SingleOrDefaultAsync(x => x.UserId == context.UserId && x.Id == id && x.DeletedAt == null, ct);
            var invalid = CanModify(entity, expected);
            if (invalid is not null) return invalid;
            if (!await PreservesSavings(db, context.UserId, entity, null, ct))
                return new(409, new { error = "La eliminación dejaría sin respaldo el dinero reservado en bolsillos." });
            entity!.DeletedAt = context.Now;
            entity.Version++;
            return new(200, new { revision = context.Revision, id, version = FinanceCommands.Number(entity.Version), deleted = true });
        }, ct);
    }

    private static CommandOutcome? CanModify(NormalizedMovement? entity, long expected)
    {
        if (entity is null) return new(404, new { error = "El movimiento no existe." });
        if (entity.PocketId is not null || entity.Category == "ahorro") return new(409, new { error = "Las transferencias se revierten desde el bolsillo." });
        if (entity.Version != expected || entity.Version == long.MaxValue) return new(409, new { error = "El movimiento cambió. Recarga antes de continuar." });
        return null;
    }

    private static async Task<bool> PreservesSavings(NormalizedFinanceDb db, Guid owner,
        NormalizedMovement? previous, NormalizedMovement? next, CancellationToken ct)
    {
        var currencies = await db.Pockets.AsNoTracking().Where(p => p.UserId == owner && p.ClosedAt == null && p.CurrentAmount > 0)
            .Select(p => p.Currency).Distinct().ToArrayAsync(ct);
        foreach (var currency in currencies)
        {
            var delta = Contribution(next, currency) - Contribution(previous, currency);
            if (delta >= 0) continue;
            var values = await db.Movements.AsNoTracking().Where(m => m.UserId == owner && m.Currency == currency && m.DeletedAt == null)
                .Select(m => new { m.Type, m.Amount }).ToArrayAsync(ct);
            var available = values.Sum(m => m.Type == "ingreso" ? m.Amount : -m.Amount);
            if (available + delta < Math.Min(available, 0m)) return false;
        }
        return true;
    }

    private static decimal Contribution(NormalizedMovement? movement, string currency) =>
        movement is null || movement.Currency != currency ? 0 : movement.Type == "ingreso" ? movement.Amount : -movement.Amount;
}
