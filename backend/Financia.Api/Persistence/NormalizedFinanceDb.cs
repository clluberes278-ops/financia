using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Persistence;

public sealed class FinanceAccount
{
    public Guid UserId { get; set; }
    public long Revision { get; set; }
    public string ImportKey { get; set; } = "";
    public string ImportHash { get; set; } = "";
    public long? LegacyRevision { get; set; }
}

public sealed class NormalizedPocket
{
    public Guid UserId { get; set; }
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Currency { get; set; } = "";
    public decimal TargetAmount { get; set; }
    public decimal CurrentAmount { get; set; }
    public string Emoji { get; set; } = "";
    public string? Color { get; set; }
    public DateTime CreatedAt { get; set; }
    public long Version { get; set; }
}

public sealed class NormalizedMovement
{
    public Guid UserId { get; set; }
    public string Id { get; set; } = "";
    public string Currency { get; set; } = "";
    public decimal Amount { get; set; }
    public string Type { get; set; } = "";
    public string Category { get; set; } = "";
    public DateTime OccurredAt { get; set; }
    public string? Note { get; set; }
    public string? PocketId { get; set; }
    public long Version { get; set; }
}

public sealed class NormalizedFinanceDb(DbContextOptions<NormalizedFinanceDb> options) : DbContext(options)
{
    public const string Schema = "financia";
    public const string MigrationsHistoryTable = "__FinanciaV2MigrationsHistory";

    public DbSet<FinanceAccount> Accounts => Set<FinanceAccount>();
    public DbSet<NormalizedPocket> Pockets => Set<NormalizedPocket>();
    public DbSet<NormalizedMovement> Movements => Set<NormalizedMovement>();
    public DbSet<FinanceDocument> LegacyDocuments => Set<FinanceDocument>();

    protected override void OnModelCreating(ModelBuilder builder) => InitialNormalizedModel.Configure(builder);
}
