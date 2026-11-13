using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

namespace Financia.Api;

public sealed record Movement(string Id, string Currency, decimal Amount, string Type, string Category,
    string Date,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Note,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? PocketId);
public sealed record Pocket(string Id, string Name, string Currency, decimal TargetAmount,
    decimal CurrentAmount, string Emoji, string CreatedAt);
public sealed record FinancialSnapshot(int Version, Movement[] Transactions, Pocket[] Pockets)
{
    public static FinancialSnapshot Empty => new(1, [], []);
    public string? Validate()
    {
        if (Version != 1 || Transactions is null || Pockets is null) return "Formato de historial inválido.";
        if (Transactions.Length > 100000 || Pockets.Length > 1000) return "El historial supera el límite permitido.";
        if (Transactions.Any(t => t is null || string.IsNullOrWhiteSpace(t.Id) || t.Id.Length > 256
            || !CurrencyValid(t.Currency) || !AmountValid(t.Amount) || t.Amount == 0
            || t.Type is not ("ingreso" or "gasto") || !Categories.Contains(t.Category)
            || !DateTimeOffset.TryParse(t.Date, out _) || t.Note?.Length > 4000 || t.PocketId?.Length > 256))
            return "Hay movimientos inválidos.";
        if (Pockets.Any(p => p is null || string.IsNullOrWhiteSpace(p.Id) || p.Id.Length > 256
            || string.IsNullOrWhiteSpace(p.Name) || p.Name.Length > 200 || p.Emoji is null || p.Emoji.Length > 64
            || !CurrencyValid(p.Currency) || !AmountValid(p.TargetAmount) || p.TargetAmount == 0
            || !AmountValid(p.CurrentAmount) || !DateTimeOffset.TryParse(p.CreatedAt, out _)))
            return "Hay bolsillos inválidos.";
        if (Transactions.Select(t => t.Id).Distinct().Count() != Transactions.Length
            || Pockets.Select(p => p.Id).Distinct().Count() != Pockets.Length) return "Hay identificadores duplicados.";
        return null;
    }
    private static readonly HashSet<string> Categories = ["comida", "transporte", "entretenimiento", "servicios", "salud", "educacion", "salario", "ahorro", "otros"];
    private static bool CurrencyValid(string currency) => currency is "DOP" or "USD";
    private static bool AmountValid(decimal value) => value >= 0 && value <= 999999999999.99m && decimal.Round(value, 2) == value;
}
public sealed record FinanceResponse(long Revision, FinancialSnapshot Snapshot);
public sealed record SaveFinanceRequest(long ExpectedRevision, FinancialSnapshot Snapshot);

public sealed class FinanceDocument
{
    public Guid OwnerId { get; set; }
    public long Revision { get; set; }
    public string Json { get; set; } = "";
}
public sealed class FinanceDb(DbContextOptions<FinanceDb> options) : DbContext(options)
{
    public DbSet<FinanceDocument> Documents => Set<FinanceDocument>();
    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.Entity<FinanceDocument>().HasKey(x => x.OwnerId);
        builder.Entity<FinanceDocument>().Property(x => x.Revision).IsConcurrencyToken();
    }
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
}
