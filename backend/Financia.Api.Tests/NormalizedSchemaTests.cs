using Financia.Api;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Xunit;

namespace Financia.Api.Tests;

public sealed class NormalizedSchemaTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void InitialMigrationMatchesModelAndKeepsLegacyTableOutsideItsDdl(bool postgres)
    {
        // Script generation and model comparison do not open a PostgreSQL connection.
        using var db = new NormalizedFinanceDb(Options(postgres));
        Assert.False(db.Database.HasPendingModelChanges());
        var migrator = db.GetService<IMigrator>();
        var script = migrator.GenerateScript();
        var rollback = migrator.GenerateScript("20261113000100_InitialNormalized", Migration.InitialDatabase);
        Assert.DoesNotContain("Documents", script);
        Assert.DoesNotContain("Documents", rollback);
        Assert.Contains(NormalizedFinanceDb.MigrationsHistoryTable, script);
        Assert.Contains("FOREIGN KEY", script);
        Assert.Contains("pocket_id", script);
        Assert.Contains("user_id", script);
        Assert.Contains("ck_movements_amount", script);
        Assert.Contains("ck_pockets_currency", script);
        Assert.Contains("ON DELETE RESTRICT", script);
        Assert.Contains("DROP TABLE", rollback);
        foreach (var table in new[] { "finance_accounts", "pockets", "movements" })
        {
            if (postgres)
                Assert.Matches($"CREATE TABLE (?:\"financia\"|financia)\\.(?:\"{table}\"|{table})", script);
            else
                Assert.Contains($"CREATE TABLE \"{table}\"", script);
        }
        var amount = db.Model.FindEntityType(typeof(NormalizedMovement))!.FindProperty(nameof(NormalizedMovement.Amount))!;
        Assert.Equal(14, amount.GetPrecision());
        Assert.Equal(2, amount.GetScale());
        if (postgres)
        {
            Assert.Contains("CREATE SCHEMA", script);
            Assert.Contains("numeric(14,2)", script);
            Assert.Contains("timestamp with time zone", script);
            Assert.Matches("(?:\"financia\"|financia)\\.\"__FinanciaV2MigrationsHistory\"", script);
        }
        else
        {
            Assert.DoesNotContain("CREATE SCHEMA", script);
            Assert.DoesNotContain("financia.", script);
            Assert.DoesNotContain("\"financia\".", script);
        }
    }

    [Fact]
    public async Task SqliteMigrationIsRepeatableAndPreservesOriginalLegacyDocument()
    {
        var database = Path.Combine(Path.GetTempPath(), $"financia-schema-{Guid.NewGuid():N}.db");
        var connection = $"Data Source={database};Pooling=False";
        var owner = Guid.Parse("11111111-1111-1111-1111-111111111111");
        const string original = "{\"version\":1,\"transactions\":[],\"pockets\":[]}";
        try
        {
            await using (var legacy = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlite(connection).Options))
            {
                await legacy.Database.EnsureCreatedAsync();
                legacy.Documents.Add(new FinanceDocument { OwnerId = owner, Revision = 7, Json = original });
                await legacy.SaveChangesAsync();
            }
            await using (var normalized = new NormalizedFinanceDb(Options(false, connection)))
            {
                await normalized.Database.MigrateAsync();
                await normalized.Database.MigrateAsync();
                Assert.False(normalized.Database.HasPendingModelChanges());
                Assert.Single(await normalized.Database.GetAppliedMigrationsAsync());
                Assert.Empty(await normalized.Accounts.ToListAsync());
                Assert.Empty(await normalized.Pockets.ToListAsync());
                Assert.Empty(await normalized.Movements.ToListAsync());
                var legacy = await normalized.LegacyDocuments.SingleAsync();
                Assert.Equal(owner, legacy.OwnerId);
                Assert.Equal(7, legacy.Revision);
                Assert.Equal(original, legacy.Json);
            }
            await using var verification = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlite(connection).Options);
            Assert.Equal(original, (await verification.Documents.SingleAsync()).Json);
        }
        finally
        {
            File.Delete(database);
        }
    }

    private static DbContextOptions<NormalizedFinanceDb> Options(bool postgres, string? sqliteConnection = null)
    {
        var builder = new DbContextOptionsBuilder<NormalizedFinanceDb>();
        if (postgres)
            builder.UseNpgsql("Host=127.0.0.1;Database=script_only;Username=unused;Password=unused", options =>
                options.MigrationsHistoryTable(NormalizedFinanceDb.MigrationsHistoryTable, NormalizedFinanceDb.Schema));
        else
            builder.UseSqlite(sqliteConnection ?? "Data Source=:memory:", options =>
                options.MigrationsHistoryTable(NormalizedFinanceDb.MigrationsHistoryTable));
        return builder.Options;
    }
}
