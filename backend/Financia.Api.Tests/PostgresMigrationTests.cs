using Financia.Api;
using Financia.Api.Persistence;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Financia.Api.Tests;

public sealed class PostgresMigrationTests
{
    [PostgresFact]
    public async Task NewHostWithV2DisabledProtectsImportedOwnerAndAllowsOtherLegacyOwners()
    {
        await using var factory = new ApiFactory();
        using var original = factory.CreateClient();
        original.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "alice");
        using var import = new HttpRequestMessage(HttpMethod.Post, "/api/v2/imports/legacy") {
            Content = JsonContent.Create(new {
                expectedRevision = "0", snapshot = new { version = 1, transactions = Array.Empty<object>(), pockets = Array.Empty<object>() }
            })
        };
        import.Headers.Add("Idempotency-Key", "before-new-host");
        using var imported = await original.SendAsync(import);
        imported.EnsureSuccessStatusCode();
        string database;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>();
            Assert.True(db.Database.IsNpgsql());
            database = db.Database.GetDbConnection().Database;
        }

        // The original factory retains ownership until both hosts are disposed.
        await using var disabled = factory.WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
                new Dictionary<string, string?> { ["FinanceV2:Enabled"] = "false" })));
        using var alice = disabled.CreateClient();
        alice.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "alice");
        await using (var scope = disabled.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>();
            Assert.True(db.Database.IsNpgsql());
            Assert.Equal(database, db.Database.GetDbConnection().Database);
            Assert.False(scope.ServiceProvider.GetRequiredService<IConfiguration>().GetValue<bool>("FinanceV2:Enabled"));
        }
        using var unavailable = await alice.GetAsync("/api/v2/finances");
        Assert.Equal(HttpStatusCode.NotFound, unavailable.StatusCode);
        using var guardedRead = await alice.GetAsync("/api/finances");
        Assert.Equal(HttpStatusCode.Conflict, guardedRead.StatusCode);
        var legacyWrite = new SaveFinanceRequest(0, new FinancialSnapshot(1,
            [new Movement("legacy-new-host", "DOP", 10m, "ingreso", "salario", "2026-11-01T12:00:00Z", null, null)], []));
        using var guardedWrite = await alice.PutAsJsonAsync("/api/finances", legacyWrite);
        Assert.Equal(HttpStatusCode.Conflict, guardedWrite.StatusCode);
        using var bob = disabled.CreateClient();
        bob.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "bob");
        Assert.Equal(0, (await bob.GetFromJsonAsync<FinanceResponse>("/api/finances"))!.Revision);
        using var saved = await bob.PutAsJsonAsync("/api/finances", legacyWrite);
        saved.EnsureSuccessStatusCode();
        var loaded = await bob.GetFromJsonAsync<FinanceResponse>("/api/finances");
        Assert.Equal(1, loaded!.Revision);
        Assert.Equal("legacy-new-host", Assert.Single(loaded.Snapshot.Transactions).Id);
    }

    [PostgresFact]
    public async Task UpgradesExistingRowsRepeatablyAndKeepsLegacyDocument()
    {
        await using var factory = new ApiFactory(financeV2Enabled: false);
        using var client = factory.CreateClient();
        await using var scope = factory.Services.CreateAsyncScope();
        var legacy = scope.ServiceProvider.GetRequiredService<FinanceDb>();
        var db = scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>();
        Assert.True(db.Database.IsNpgsql());
        var owner = Guid.Parse("11111111-1111-1111-1111-111111111111");
        const string original = "{\"version\":1,\"transactions\":[],\"pockets\":[]}";
        legacy.Documents.Add(new FinanceDocument { OwnerId = owner, Revision = 7, Json = original });
        await legacy.SaveChangesAsync();
        await db.GetService<IMigrator>().MigrateAsync("20261113000100_InitialNormalized");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO financia.finance_accounts (user_id, revision, import_key, import_hash, legacy_revision) VALUES ({owner}, {1L}, {"original-import"}, {new string('a', 64)}, {7L})");
        var date = new DateTime(2026, 11, 1, 12, 0, 0, DateTimeKind.Utc);
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO financia.pockets (user_id, id, name, currency, target_amount, current_amount, emoji, created_at, version) VALUES ({owner}, {"p1"}, {"Meta"}, {"DOP"}, {100m}, {0m}, {""}, {date}, {1L})");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO financia.movements (user_id, id, currency, amount, type, category, occurred_at, pocket_id, version) VALUES ({owner}, {"m1"}, {"DOP"}, {25m}, {"gasto"}, {"ahorro"}, {date}, {"p1"}, {1L})");
        await db.Database.MigrateAsync();
        await db.Database.MigrateAsync();
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Equal(3, (await db.Database.GetAppliedMigrationsAsync()).Count());
        var account = await db.Accounts.SingleAsync();
        Assert.Equal("original-import", account.ImportKey);
        Assert.Equal(7, account.LegacyRevision);
        Assert.Null(account.ImportResponseJson);
        Assert.Null((await db.Pockets.SingleAsync()).ClosedAt);
        var movement = await db.Movements.SingleAsync();
        Assert.Equal(25m, movement.Amount);
        Assert.Equal("p1", movement.PocketId);
        Assert.Null(movement.DeletedAt);
        Assert.Empty(await db.Receipts.ToArrayAsync());
        Assert.Empty(await db.Outbox.ToArrayAsync());
        await db.GetService<IMigrator>().MigrateAsync("20261113000100_InitialNormalized");
        await db.Database.MigrateAsync();
        db.ChangeTracker.Clear();
        Assert.Equal("m1", (await db.Movements.SingleAsync()).Id);
        Assert.Equal("p1", (await db.Pockets.SingleAsync()).Id);
        legacy.ChangeTracker.Clear();
        var document = await legacy.Documents.SingleAsync();
        Assert.Equal(7, document.Revision);
        Assert.Equal(original, document.Json);
    }
}
