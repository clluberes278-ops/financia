using System.Security.Claims;
using System.Text.Json.Serialization;
using Financia.Api.Contracts;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Features;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record BankImportRequest(Movement[] Transactions);
public sealed record BankImportResponse(string Revision, int Imported, int Skipped);

public static class BankImportCommands
{
    public static void MapBankImportCommands(this RouteGroupBuilder routes) =>
        routes.MapPost("/imports/bank", Import).WithFinanceContract("importBankTransactions");

    private static Task<IResult> Import(BankImportRequest request, HttpRequest http, ClaimsPrincipal user,
        NormalizedFinanceDb db, CancellationToken ct)
    {
        if (request.Transactions is null || request.Transactions.Length > 1000)
            return Invalid("Envía como máximo 1000 movimientos por importación.");
        var validation = new FinancialSnapshot(1, request.Transactions, []).Validate();
        if (validation is not null) return Invalid(validation);
        if (request.Transactions.Any(m => !m.Id.StartsWith("gmail:", StringComparison.Ordinal)
            || m.Id.Length == "gmail:".Length || m.PocketId is not null || m.Category == "ahorro"))
            return Invalid("La importación solo admite movimientos Gmail ordinarios identificados con gmail:.");
        if (request.Transactions.Any(m => !NormalizedFinances.TryUtc(m.Date, out _)))
            return Invalid("Las fechas deben incluir una zona horaria explícita y ser válidas.");
        // The prefix is an idempotent source identifier, not proof of bank verification.
        return FinanceCommands.Execute(request, http, user, db, "finances.importBankTransactions", async context =>
        {
            var ids = request.Transactions.Select(m => m.Id).ToArray();
            var known = await db.Movements.AsNoTracking().Where(m => m.UserId == context.UserId && ids.Contains(m.Id))
                .Select(m => m.Id).ToArrayAsync(ct);
            var knownIds = known.ToHashSet(StringComparer.Ordinal);
            var additions = request.Transactions.Where(m => !knownIds.Contains(m.Id)).ToArray();
            var reservedCurrencies = await db.Pockets.AsNoTracking()
                .Where(p => p.UserId == context.UserId && p.ClosedAt == null && p.CurrentAmount > 0)
                .Select(p => p.Currency).Distinct().ToArrayAsync(ct);
            foreach (var currency in reservedCurrencies)
            {
                var delta = additions.Where(m => m.Currency == currency).Sum(m => m.Type == "ingreso" ? m.Amount : -m.Amount);
                if (delta >= 0) continue;
                var amounts = await db.Movements.AsNoTracking()
                    .Where(m => m.UserId == context.UserId && m.Currency == currency && m.DeletedAt == null)
                    .Select(m => new { m.Type, m.Amount }).ToArrayAsync(ct);
                var available = amounts.Sum(m => m.Type == "ingreso" ? m.Amount : -m.Amount);
                if (available + delta < Math.Min(available, 0m))
                    return new(409, new { error = "La importación dejaría sin respaldo el dinero reservado en bolsillos." });
            }
            db.Movements.AddRange(additions.Select(m =>
            {
                NormalizedFinances.TryUtc(m.Date, out var occurredAt);
                return new NormalizedMovement { UserId = context.UserId, Id = m.Id, Currency = m.Currency, Amount = m.Amount,
                    Type = m.Type, Category = m.Category, Note = m.Note, OccurredAt = occurredAt, Version = 1 };
            }));
            return new(200, new BankImportResponse(context.Revision, additions.Length, knownIds.Count));
        }, ct);
    }

    private static Task<IResult> Invalid(string error) => Task.FromResult<IResult>(Results.BadRequest(new { error }));
}
