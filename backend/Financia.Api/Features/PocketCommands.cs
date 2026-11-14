using System.Security.Claims;
using System.Text.Json.Serialization;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Features;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreatePocketRequest(string Id, string Name, string Currency, string TargetAmount, string? Emoji = null, string? Color = null);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record EditPocketRequest(string ExpectedVersion, string Name, string TargetAmount, string? Emoji = null, string? Color = null);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PocketTransferRequest(string Amount, string ExpectedVersion);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ClosePocketRequest(string ExpectedVersion);

public static class PocketCommands
{
    public static void MapPocketCommands(this RouteGroupBuilder routes)
    {
        routes.MapPost("/pockets", Create);
        routes.MapPatch("/pockets/{id}", Edit);
        routes.MapPost("/pockets/{id}/deposit", Deposit);
        routes.MapPost("/pockets/{id}/withdraw", Withdraw);
        routes.MapPost("/pockets/{id}/close", Close);
    }

    private static Task<IResult> Create(CreatePocketRequest request, HttpRequest http,
        ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Id) || request.Id.Length > 256
            || request.Currency is not ("DOP" or "USD") || !ValidPresentation(request.Name, request.Emoji, request.Color)
            || !FinanceCommands.TryAmount(request.TargetAmount, out var target))
            return Invalid("El bolsillo requiere identificador, nombre, moneda e importe de meta válidos.");
        return FinanceCommands.Execute(request, http, user, db, "pocket.create", async context => {
            if (await context.Db.Pockets.AnyAsync(p => p.UserId == context.UserId && p.Id == request.Id, context.CancellationToken))
                return Error(409, "Ya existe un bolsillo con ese identificador.");
            var pocket = new NormalizedPocket {
                UserId = context.UserId, Id = request.Id, Name = request.Name.Trim(), Currency = request.Currency,
                TargetAmount = target, CurrentAmount = 0, Emoji = request.Emoji?.Trim() ?? "🎯", Color = request.Color,
                CreatedAt = context.Now, Version = 1,
            };
            context.Db.Pockets.Add(pocket);
            return new CommandOutcome(201, new { revision = context.Revision, pocket = NormalizedFinances.ToResponse(pocket) });
        }, ct);
    }

    private static Task<IResult> Edit(string id, EditPocketRequest request, HttpRequest http,
        ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct)
    {
        if (!FinanceCommands.TryVersion(request.ExpectedVersion, out var expectedVersion)
            || !FinanceCommands.TryAmount(request.TargetAmount, out var target) || !ValidPresentation(request.Name, request.Emoji, request.Color))
            return Invalid("La versión, el nombre o la meta del bolsillo no son válidos.");
        return FinanceCommands.Execute(new { pocketId = id, request }, http, user, db, "pocket.edit", async context => {
            var pocket = await Find(context, id);
            var failure = ValidateVersion(pocket, expectedVersion);
            if (failure is not null) return failure;
            pocket!.Name = request.Name.Trim();
            pocket.TargetAmount = target;
            pocket.Emoji = request.Emoji?.Trim() ?? "🎯";
            pocket.Color = request.Color;
            pocket.Version++;
            return new CommandOutcome(200, new { revision = context.Revision, pocket = NormalizedFinances.ToResponse(pocket) });
        }, ct);
    }

    private static Task<IResult> Deposit(string id, PocketTransferRequest request, HttpRequest http,
        ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct) => Transfer(id, request, http, user, db, deposit: true, ct);

    private static Task<IResult> Withdraw(string id, PocketTransferRequest request, HttpRequest http,
        ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct) => Transfer(id, request, http, user, db, deposit: false, ct);

    private static Task<IResult> Transfer(string id, PocketTransferRequest request, HttpRequest http,
        ClaimsPrincipal user, NormalizedFinanceDb db, bool deposit, CancellationToken ct)
    {
        if (!FinanceCommands.TryAmount(request.Amount, out var amount)
            || !FinanceCommands.TryVersion(request.ExpectedVersion, out var expectedVersion))
            return Invalid("El importe y la versión deben ser válidos.");
        return FinanceCommands.Execute(new { pocketId = id, request }, http, user, db, deposit ? "pocket.deposit" : "pocket.withdraw", async context => {
            var pocket = await Find(context, id);
            var failure = ValidateVersion(pocket, expectedVersion);
            if (failure is not null) return failure;
            if (deposit)
            {
                var movements = await context.Db.Movements.AsNoTracking()
                    .Where(m => m.UserId == context.UserId && m.Currency == pocket!.Currency && m.DeletedAt == null)
                    .Select(m => new { m.Type, m.Amount }).ToArrayAsync(context.CancellationToken);
                var available = movements.Sum(m => m.Type == "ingreso" ? m.Amount : -m.Amount);
                if (amount > available) return Error(409, "Saldo insuficiente en la moneda del bolsillo.");
                if (pocket!.CurrentAmount > FinanceCommands.MaximumAmount - amount) return Error(409, "El saldo del bolsillo supera el límite permitido.");
            }
            else if (amount > pocket!.CurrentAmount) return Error(409, "El retiro supera el saldo del bolsillo.");
            var movement = InternalMovement(context, pocket!, amount, deposit,
                (deposit ? "Abono a bolsillo: " : "Retiro de bolsillo: ") + pocket!.Name);
            pocket.CurrentAmount += deposit ? amount : -amount;
            pocket.Version++;
            context.Db.Movements.Add(movement);
            return new CommandOutcome(200, new { revision = context.Revision,
                pocket = NormalizedFinances.ToResponse(pocket), movement = NormalizedFinances.ToResponse(movement) });
        }, ct);
    }

    private static Task<IResult> Close(string id, ClosePocketRequest request, HttpRequest http,
        ClaimsPrincipal user, NormalizedFinanceDb db, CancellationToken ct)
    {
        if (!FinanceCommands.TryVersion(request.ExpectedVersion, out var expectedVersion)) return Invalid("La versión del bolsillo no es válida.");
        return FinanceCommands.Execute(new { pocketId = id, request }, http, user, db, "pocket.close", async context => {
            var pocket = await Find(context, id);
            var failure = ValidateVersion(pocket, expectedVersion);
            if (failure is not null) return failure;
            NormalizedMovement? movement = null;
            if (pocket!.CurrentAmount > 0)
            {
                movement = InternalMovement(context, pocket, pocket.CurrentAmount, deposit: false, "Devolución por bolsillo cerrado: " + pocket.Name);
                context.Db.Movements.Add(movement);
            }
            pocket.CurrentAmount = 0;
            pocket.ClosedAt = context.Now;
            pocket.Version++;
            return new CommandOutcome(200, new { revision = context.Revision,
                pocket = NormalizedFinances.ToResponse(pocket), movement = movement is null ? null : NormalizedFinances.ToResponse(movement) });
        }, ct);
    }

    private static Task<NormalizedPocket?> Find(FinanceCommandContext context, string id) => context.Db.Pockets
        .SingleOrDefaultAsync(p => p.UserId == context.UserId && p.Id == id && p.ClosedAt == null, context.CancellationToken);

    private static CommandOutcome? ValidateVersion(NormalizedPocket? pocket, long expectedVersion)
    {
        if (pocket is null) return Error(404, "El bolsillo no existe o está cerrado.");
        if (pocket.Version != expectedVersion) return Error(409, "El bolsillo cambió en otro dispositivo. Recarga antes de guardar.");
        if (pocket.Version == long.MaxValue) return Error(409, "La versión del bolsillo alcanzó el límite permitido.");
        return null;
    }

    private static NormalizedMovement InternalMovement(FinanceCommandContext context, NormalizedPocket pocket, decimal amount, bool deposit, string note) => new() {
        UserId = context.UserId, Id = Guid.NewGuid().ToString("D"), Currency = pocket.Currency, Amount = amount,
        Type = deposit ? "gasto" : "ingreso", Category = "ahorro", PocketId = pocket.Id, Note = note, OccurredAt = context.Now, Version = 1,
    };

    private static bool ValidPresentation(string? name, string? emoji, string? color) =>
        !string.IsNullOrWhiteSpace(name) && name.Length <= 200
        && (emoji is null || (!string.IsNullOrWhiteSpace(emoji) && emoji.Length <= 64)) && (color is null || color.Length <= 64);

    private static CommandOutcome Error(int status, string message) => new(status, new { error = message });
    private static Task<IResult> Invalid(string message) => Task.FromResult<IResult>(Results.BadRequest(new { error = message }));
}
