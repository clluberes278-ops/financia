using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Financia.Api.Tests;

public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("FINANCIA_TEST_POSTGRES")))
            Skip = "Set FINANCIA_TEST_POSTGRES to an isolated PostgreSQL administrative connection.";
    }
}

public sealed class PostgresCommandTests
{
    [PostgresFact]
    public async Task OverlappingSameKeyWritesHaveOneEffectAndReplayTheSameReceipt()
    {
        var overlap = new SaveOverlap();
        await using var factory = Factory(overlap);
        using var first = Client(factory);
        using var second = Client(factory);
        await Initialize(first);
        overlap.Arm();
        var responses = await Task.WhenAll(Send(first, "/movements", "same", Movement()), Send(second, "/movements", "same", Movement()));
        try
        {
            Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
            Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict);
            using var retry = await Send(first, "/movements", "same", Movement());
            Assert.Equal(HttpStatusCode.Created, retry.StatusCode);
            var receipt = await retry.Content.ReadAsStringAsync();
            foreach (var success in responses.Where(x => x.IsSuccessStatusCode))
                Assert.Equal(receipt, await success.Content.ReadAsStringAsync());
            await Inspect(factory, async db => {
                Assert.Single(await db.Movements.Where(x => x.Id == "manual").ToArrayAsync());
                Assert.Single(await db.Receipts.ToArrayAsync());
                Assert.Equal(2, await db.Outbox.CountAsync());
                Assert.Equal(2, (await db.Accounts.SingleAsync()).Revision);
            });
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    [PostgresFact]
    public async Task OverlappingDepositsCannotSpendTheSameBalanceTwice()
    {
        var overlap = new SaveOverlap();
        await using var factory = Factory(overlap);
        using var first = Client(factory);
        using var second = Client(factory);
        await Initialize(first);
        foreach (var id in new[] { "p1", "p2" })
        {
            using var response = await Send(first, "/pockets", id, new { id, name = "Meta", currency = "DOP", targetAmount = "1000" });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }
        overlap.Arm();
        var responses = await Task.WhenAll(
            Send(first, "/pockets/p1/deposit", "deposit-1", new { amount = "80", expectedVersion = "1" }),
            Send(second, "/pockets/p2/deposit", "deposit-2", new { amount = "80", expectedVersion = "1" }));
        try
        {
            Assert.Single(responses, x => x.StatusCode == HttpStatusCode.OK);
            Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict);
            await Inspect(factory, async db => {
                Assert.Equal(80m, await db.Pockets.SumAsync(x => x.CurrentAmount));
                Assert.Single(await db.Movements.Where(x => x.PocketId != null).ToArrayAsync());
                Assert.Equal(3, await db.Receipts.CountAsync());
                Assert.Equal(4, await db.Outbox.CountAsync());
                Assert.Equal(4, (await db.Accounts.SingleAsync()).Revision);
            });
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    [PostgresFact]
    public async Task DatabaseConstraintFailureRollsBackMovementReceiptRevisionAndOutbox()
    {
        await using var factory = new ApiFactory();
        using var client = Client(factory);
        await Initialize(client);
        await Inspect(factory, db => db.Database.ExecuteSqlRawAsync(
            "ALTER TABLE financia.finance_outbox ADD CONSTRAINT test_reject_next_event CHECK (revision < 2)"));
        using var failed = await Send(client, "/movements", "retry-after-failure", Movement());
        Assert.False(failed.IsSuccessStatusCode);
        await Inspect(factory, async db => {
            Assert.Empty(await db.Movements.Where(x => x.Id == "manual").ToArrayAsync());
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Single(await db.Outbox.ToArrayAsync());
            Assert.Equal(1, (await db.Accounts.SingleAsync()).Revision);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE financia.finance_outbox DROP CONSTRAINT test_reject_next_event");
        });
        using var retry = await Send(client, "/movements", "retry-after-failure", Movement());
        Assert.Equal(HttpStatusCode.Created, retry.StatusCode);
        await Inspect(factory, async db => {
            Assert.Single(await db.Receipts.ToArrayAsync());
            Assert.Equal(2, await db.Outbox.CountAsync());
        });
    }

    private static ApiFactory Factory(SaveOverlap overlap) => new(configureServices: services =>
        services.AddDbContext<NormalizedFinanceDb>(options => options.AddInterceptors(overlap)));

    private static HttpClient Client(ApiFactory factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "alice");
        return client;
    }

    private static object Movement() => new { id = "manual", currency = "DOP", amount = "25", type = "ingreso", category = "salario", date = "2026-11-13T12:00:00Z" };

    private static async Task Initialize(HttpClient client)
    {
        using var response = await Send(client, "/imports/legacy", "import", new {
            expectedRevision = "0", snapshot = new {
                version = 1, transactions = new[] { new { id = "income", currency = "DOP", amount = 100m,
                    type = "ingreso", category = "salario", date = "2026-11-13T12:00:00Z" } }, pockets = Array.Empty<object>()
            }
        });
        response.EnsureSuccessStatusCode();
    }

    private static async Task<HttpResponseMessage> Send(HttpClient client, string path, string key, object body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v2" + path) { Content = JsonContent.Create(body) };
        request.Headers.Add("Idempotency-Key", key);
        return await client.SendAsync(request);
    }

    private static async Task Inspect(ApiFactory factory, Func<NormalizedFinanceDb, Task> action)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>();
        Assert.True(db.Database.IsNpgsql());
        await action(db);
    }

    // Both transactions have read their snapshots and prepared all mutations before either writes.
    // A timeout turns a missing participant into a useful failure instead of hanging the suite.
    private sealed class SaveOverlap : SaveChangesInterceptor
    {
        private int remaining;
        private readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public void Arm() => Volatile.Write(ref remaining, 2);
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Volatile.Read(ref remaining) > 0)
            {
                if (Interlocked.Decrement(ref remaining) == 0) ready.TrySetResult();
                await ready.Task.WaitAsync(TimeSpan.FromSeconds(20), cancellationToken);
            }
            return result;
        }
    }
}
