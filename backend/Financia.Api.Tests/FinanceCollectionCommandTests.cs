using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Financia.Api.Tests;

public sealed class FinanceCollectionCommandTests
{
    private static readonly Guid Alice = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Bob = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private const string ClearPath = "/api/v2/finances/clear-transactions";
    private const string ResetPath = "/api/v2/finances/reset";

    [Fact]
    public async Task ClearRejectsReservedMoneyWithoutChangingAnyRows()
    {
        await using var factory = new ApiFactory();
        using var client = Client(factory);
        await Seed(factory, Alice, 20);
        using var response = await Send(client, ClearPath, "clear", "3");
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await Inspect(factory, async db =>
        {
            Assert.All(await db.Movements.ToArrayAsync(), movement => { Assert.Null(movement.DeletedAt); Assert.Equal(1, movement.Version); });
            Assert.Equal(20, (await db.Pockets.SingleAsync()).CurrentAmount);
            Assert.Equal(3, (await db.Accounts.SingleAsync()).Revision);
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Empty(await db.Outbox.ToArrayAsync());
        });
    }

    [Fact]
    public async Task ClearLeavesEmptyPocketsOpenAndRetryNeverDeletesLaterMovements()
    {
        await using var factory = new ApiFactory();
        using var client = Client(factory);
        await Seed(factory, Alice, 0);
        using var first = await Send(client, ClearPath, "stable-clear", "3");
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var original = await first.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(original);
        Assert.Equal("transactions", json.RootElement.GetProperty("scope").GetString());
        Assert.True(json.RootElement.GetProperty("cleared").GetBoolean());
        Assert.Equal("4", json.RootElement.GetProperty("revision").GetString());
        await Inspect(factory, async db =>
        {
            Assert.All(await db.Movements.ToArrayAsync(), movement => { Assert.NotNull(movement.DeletedAt); Assert.Equal(2, movement.Version); });
            var pocket = await db.Pockets.SingleAsync();
            Assert.Null(pocket.ClosedAt);
            Assert.Equal(1, pocket.Version);
            var account = await db.Accounts.SingleAsync();
            account.Revision = 5;
            db.Movements.Add(Movement(Alice, "later"));
            await db.SaveChangesAsync();
        });
        using var retry = await Send(client, ClearPath, "stable-clear", "3");
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(original, await retry.Content.ReadAsStringAsync());
        using var reused = await Send(client, ResetPath, "stable-clear", "3");
        Assert.Equal(HttpStatusCode.Conflict, reused.StatusCode);
        await Inspect(factory, async db =>
        {
            Assert.Null((await db.Movements.SingleAsync(m => m.Id == "later")).DeletedAt);
            Assert.Equal(5, (await db.Accounts.SingleAsync()).Revision);
            Assert.Single(await db.Receipts.ToArrayAsync());
            Assert.Equal("finances.clearTransactions", (await db.Receipts.SingleAsync()).Operation);
            Assert.Equal(4, (await db.Outbox.SingleAsync()).Revision);
        });
    }

    [Fact]
    public async Task ResetClosesOnlyOwnersPocketsPreservesIdsAndPublishesOneEvent()
    {
        await using var factory = new ApiFactory();
        using var client = Client(factory);
        await Seed(factory, Alice, 20);
        await Seed(factory, Bob, 50);
        using var response = await Send(client, ResetPath, "reset", "3");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("all", result.RootElement.GetProperty("scope").GetString());
        await Inspect(factory, async db =>
        {
            var alicePocket = await db.Pockets.SingleAsync(p => p.UserId == Alice);
            Assert.Equal(0, alicePocket.CurrentAmount);
            Assert.Equal(2, alicePocket.Version);
            Assert.NotNull(alicePocket.ClosedAt);
            var movements = await db.Movements.Where(m => m.UserId == Alice).ToArrayAsync();
            Assert.Equal(2, movements.Length);
            Assert.All(movements, movement => { Assert.NotNull(movement.DeletedAt); Assert.Equal(2, movement.Version); });
            Assert.Contains(movements, movement => movement.PocketId == alicePocket.Id);
            Assert.Equal(50, (await db.Pockets.SingleAsync(p => p.UserId == Bob)).CurrentAmount);
            Assert.All(await db.Movements.Where(m => m.UserId == Bob).ToArrayAsync(), movement => Assert.Null(movement.DeletedAt));
            Assert.Equal(3, (await db.Accounts.SingleAsync(a => a.UserId == Bob)).Revision);
            Assert.Equal("finances.reset", (await db.Receipts.SingleAsync()).Operation);
            Assert.Equal(Alice, (await db.Outbox.SingleAsync()).UserId);
        });
        using var retry = await Send(client, ResetPath, "reset", "3");
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(await response.Content.ReadAsStringAsync(), await retry.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("stale")]
    [InlineData("movement-limit")]
    [InlineData("pocket-limit")]
    public async Task RevisionAndEntityVersionFailuresAreAtomic(string scenario)
    {
        await using var factory = new ApiFactory();
        using var client = Client(factory);
        await Seed(factory, Alice, 20);
        await Inspect(factory, async db =>
        {
            if (scenario == "movement-limit") (await db.Movements.FirstAsync()).Version = long.MaxValue;
            if (scenario == "pocket-limit") (await db.Pockets.SingleAsync()).Version = long.MaxValue;
            await db.SaveChangesAsync();
        });
        using var response = await Send(client, ResetPath, "failure", scenario == "stale" ? "2" : "3");
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await Inspect(factory, async db =>
        {
            Assert.All(await db.Movements.ToArrayAsync(), movement => Assert.Null(movement.DeletedAt));
            Assert.Null((await db.Pockets.SingleAsync()).ClosedAt);
            Assert.Equal(20, (await db.Pockets.SingleAsync()).CurrentAmount);
            Assert.Equal(3, (await db.Accounts.SingleAsync()).Revision);
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Empty(await db.Outbox.ToArrayAsync());
        });
    }

    [Fact]
    public async Task RequiresAuthenticationValidRevisionAndStrictBody()
    {
        await using var factory = new ApiFactory();
        using var anonymous = factory.CreateClient();
        using var denied = await Send(anonymous, ResetPath, "anonymous", "3");
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        using var client = Client(factory);
        await Seed(factory, Alice, 0);
        foreach (var revision in new[] { "0", "-1", "1.0", "9223372036854775808" })
        {
            using var invalid = await Send(client, ResetPath, "invalid", revision);
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        }
        using var request = new HttpRequestMessage(HttpMethod.Post, ResetPath) {
            Content = JsonContent.Create(new { expectedRevision = "3", userId = Bob })
        };
        request.Headers.Add("Idempotency-Key", "unknown-property");
        using var extra = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, extra.StatusCode);
    }

    private static HttpClient Client(ApiFactory factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "alice");
        return client;
    }

    private static async Task<HttpResponseMessage> Send(HttpClient client, string path, string key, string revision)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(new { expectedRevision = revision }) };
        request.Headers.Add("Idempotency-Key", key);
        return await client.SendAsync(request);
    }

    private static NormalizedMovement Movement(Guid owner, string id) => new() {
        UserId = owner, Id = id, Currency = "DOP", Amount = 100, Type = "ingreso", Category = "salario",
        OccurredAt = DateTime.UtcNow, Version = 1,
    };

    private static Task Seed(ApiFactory factory, Guid owner, decimal balance) => Inspect(factory, async db =>
    {
        db.Accounts.Add(new FinanceAccount { UserId = owner, Revision = 3, ImportKey = "import", ImportHash = "test" });
        db.Pockets.Add(new NormalizedPocket { UserId = owner, Id = "p", Name = "Ahorro", Currency = "DOP", TargetAmount = 100,
            CurrentAmount = balance, Emoji = "", CreatedAt = DateTime.UtcNow, Version = 1 });
        db.Movements.Add(Movement(owner, "income"));
        var transfer = Movement(owner, "transfer");
        transfer.Type = "gasto"; transfer.Category = "ahorro"; transfer.PocketId = "p"; transfer.Amount = 20;
        db.Movements.Add(transfer);
        await db.SaveChangesAsync();
    });

    private static async Task Inspect(ApiFactory factory, Func<NormalizedFinanceDb, Task> action)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await action(scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>());
    }
}
