using System.Security.Claims;
using System.Text.Json.Serialization;
using Financia.Api.Contracts;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Features;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record FinanceRevisionRequest(string ExpectedRevision);
public sealed record FinanceCollectionResponse(string Revision, bool Cleared, string Scope);

public static class FinanceCollectionCommands
{
    public static void MapFinanceCollectionCommands(this RouteGroupBuilder routes)
    {
        routes.MapPost("/finances/clear-transactions", ClearTransactions).WithFinanceContract("clearTransactions");
        routes.MapPost("/finances/reset", Reset).WithFinanceContract("resetFinances");
    }

    private static Task<IResult> ClearTransactions(FinanceRevisionRequest request, HttpRequest http,
        ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct) => Clear(request, http, user, db, false, ct);

    private static Task<IResult> Reset(FinanceRevisionRequest request, HttpRequest http,
        ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct) => Clear(request, http, user, db, true, ct);

    private static Task<IResult> Clear(FinanceRevisionRequest request, HttpRequest http,
        ClaimsPrincipal user, NormalizedFinanceDb db, bool reset, CancellationToken ct)
    {
        if (!FinanceCommands.TryVersion(request.ExpectedRevision, out var expectedRevision))
            return Task.FromResult<IResult>(Results.BadRequest(new { error = "expectedRevision debe ser un entero positivo." }));
        return FinanceCommands.Execute(request, http, user, db, reset ? "finances.reset" : "finances.clearTransactions", async context =>
        {
            if (context.Account.Revision != expectedRevision)
                return new(409, new { error = "El historial cambió. Recarga antes de borrar los datos." });
            var pockets = await db.Pockets.Where(p => p.UserId == context.UserId && p.ClosedAt == null).ToArrayAsync(ct);
            if (!reset && pockets.Any(p => p.CurrentAmount != 0))
                return new(409, new { error = "Retira primero el dinero de los bolsillos antes de borrar los movimientos." });
            var movements = await db.Movements.Where(m => m.UserId == context.UserId && m.DeletedAt == null).ToArrayAsync(ct);
            if (movements.Any(m => m.Version == long.MaxValue) || (reset && pockets.Any(p => p.Version == long.MaxValue)))
                return new(409, new { error = "Una entidad alcanzó el límite de versión. No se borró ningún dato." });
            foreach (var movement in movements)
            {
                movement.DeletedAt = context.Now;
                movement.Version++;
            }
            if (reset)
                foreach (var pocket in pockets)
                {
                    pocket.CurrentAmount = 0;
                    pocket.ClosedAt = context.Now;
                    pocket.Version++;
                }
            // These explicit collection commands never manufacture transfer movements.
            // Tombstones retain the original IDs and foreign keys for audit and retry safety.
            return new(200, new FinanceCollectionResponse(context.Revision, true, reset ? "all" : "transactions"));
        }, ct);
    }
}
