using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Financia.Api.Tests;

public sealed class PocketCommandTests
{
    private static readonly Guid Alice = Guid.Parse("11111111-1111-1111-1111-111111111111");

    [Fact]
    public async Task RequiresAuthenticationInitializationAndValidUnprivilegedPayloads()
    {
        await using var factory = new ApiFactory();
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Send(anonymous, "POST", "/pockets", "anonymous", Pocket())).StatusCode);
        using var alice = Client(factory, "alice");
        Assert.Equal(HttpStatusCode.Conflict, (await Send(alice, "POST", "/pockets", "uninitialized", Pocket())).StatusCode);
        await Initialize(alice);
        var invalid = new List<object> {
            Pocket(amount: "0"), Pocket(amount: "1.001"), Pocket(amount: "1,000"), Pocket(amount: "1000000000000.00"),
            Pocket(currency: "EUR"), Pocket(id: ""),
            new { id = "p1", name = " ", currency = "DOP", targetAmount = "10" },
            new { id = "p1", name = "Meta", currency = "DOP", targetAmount = "10", currentAmount = "5" },
            new { id = "p1", name = "Meta", currency = "DOP", targetAmount = "10", userId = Alice.ToString() },
        };
        for (var index = 0; index < invalid.Count; index++)
            Assert.Equal(HttpStatusCode.BadRequest, (await Send(alice, "POST", "/pockets", "invalid-" + index, invalid[index])).StatusCode);
        await Inspect(factory, async db => {
            Assert.Empty(await db.Pockets.ToArrayAsync());
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Single(await db.Outbox.ToArrayAsync());
        });
    }

    [Fact]
    public async Task CreatesAndEditsPresentationWithoutChangingCurrencyBalanceOrCreationDate()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice);
        var beforeCreate = DateTimeOffset.UtcNow;
        var created = await Json(await Send(alice, "POST", "/pockets", "create", Pocket(id: "legacy-shaped-id")), HttpStatusCode.Created);
        var first = created.GetProperty("pocket");
        Assert.Equal("legacy-shaped-id", first.GetProperty("id").GetString());
        Assert.Equal("0.00", first.GetProperty("currentAmount").GetString());
        Assert.Equal("1000.00", first.GetProperty("targetAmount").GetString());
        Assert.Equal("1", first.GetProperty("version").GetString());
        Assert.InRange(DateTimeOffset.Parse(first.GetProperty("createdAt").GetString()!), beforeCreate, DateTimeOffset.UtcNow);
        var edited = await Json(await Send(alice, "PATCH", "/pockets/legacy-shaped-id", "edit", new {
            expectedVersion = "1", name = "Nueva meta", targetAmount = "1500.50", emoji = "🏠", color = "#abcdef",
        }));
        var second = edited.GetProperty("pocket");
        Assert.Equal("Nueva meta", second.GetProperty("name").GetString());
        Assert.Equal("1500.50", second.GetProperty("targetAmount").GetString());
        Assert.Equal("#abcdef", second.GetProperty("color").GetString());
        Assert.Equal("2", second.GetProperty("version").GetString());
        Assert.Equal("DOP", second.GetProperty("currency").GetString());
        Assert.Equal("0.00", second.GetProperty("currentAmount").GetString());
        Assert.Equal(first.GetProperty("createdAt").GetString(), second.GetProperty("createdAt").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(alice, "PATCH", "/pockets/legacy-shaped-id", "change-currency", new {
            expectedVersion = "2", name = "Nueva meta", targetAmount = "1000", currency = "USD",
        })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(alice, "PATCH", "/pockets/legacy-shaped-id", "stale-edit", new {
            expectedVersion = "1", name = "Nombre antiguo", targetAmount = "1000",
        })).StatusCode);
        await Inspect(factory, async db => {
            Assert.Equal(2, await db.Receipts.CountAsync());
            Assert.Equal(3, await db.Outbox.CountAsync());
            Assert.Empty(await db.Movements.Where(m => m.PocketId != null).ToArrayAsync());
        });
    }

    [Fact]
    public async Task DepositsWithdrawalsAndClosePreserveBothCurrenciesAndHistoricReferences()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        var imported = await Initialize(alice);
        await Json(await Send(alice, "POST", "/pockets", "create", Pocket()), HttpStatusCode.Created);
        var deposited = await Json(await Send(alice, "POST", "/pockets/p1/deposit", "deposit", new { amount = "80.00", expectedVersion = "1" }));
        Assert.Equal("80.00", deposited.GetProperty("pocket").GetProperty("currentAmount").GetString());
        var transfer = deposited.GetProperty("movement");
        Assert.Equal("gasto", transfer.GetProperty("type").GetString());
        Assert.Equal("ahorro", transfer.GetProperty("category").GetString());
        Assert.Equal("p1", transfer.GetProperty("pocketId").GetString());
        Assert.Equal("DOP", transfer.GetProperty("currency").GetString());
        Assert.True(Guid.TryParse(transfer.GetProperty("id").GetString(), out _));
        // USD funds must not authorize a DOP deposit.
        Assert.Equal(HttpStatusCode.Conflict, (await Send(alice, "POST", "/pockets/p1/deposit", "too-much-dop", new { amount = "30", expectedVersion = "2" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(alice, "POST", "/pockets/p1/withdraw", "too-much-withdraw", new { amount = "81", expectedVersion = "2" })).StatusCode);
        var withdrawn = await Json(await Send(alice, "POST", "/pockets/p1/withdraw", "withdraw", new { amount = "20", expectedVersion = "2" }));
        Assert.Equal("60.00", withdrawn.GetProperty("pocket").GetProperty("currentAmount").GetString());
        Assert.Equal("ingreso", withdrawn.GetProperty("movement").GetProperty("type").GetString());
        var closed = await Json(await Send(alice, "POST", "/pockets/p1/close", "close", new { expectedVersion = "3" }));
        Assert.Equal("0.00", closed.GetProperty("pocket").GetProperty("currentAmount").GetString());
        Assert.Equal("60.00", closed.GetProperty("movement").GetProperty("amount").GetString());
        var retry = await Json(await Send(alice, "POST", "/pockets/p1/close", "close", new { expectedVersion = "3" }));
        Assert.True(JsonElement.DeepEquals(closed, retry));
        Assert.Equal(HttpStatusCode.NotFound, (await Send(alice, "POST", "/pockets/p1/deposit", "closed-deposit", new { amount = "1", expectedVersion = "4" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(alice, "POST", "/pockets", "reuse-closed-id", Pocket())).StatusCode);
        var current = await Json(await alice.GetAsync("/api/v2/finances"));
        Assert.Empty(current.GetProperty("snapshot").GetProperty("pockets").EnumerateArray());
        Assert.Equal(5, current.GetProperty("snapshot").GetProperty("transactions").GetArrayLength());
        await Inspect(factory, async db => {
            var pocket = await db.Pockets.SingleAsync();
            Assert.NotNull(pocket.ClosedAt);
            Assert.Equal(0, pocket.CurrentAmount);
            Assert.Equal(4, pocket.Version);
            var movements = await db.Movements.ToArrayAsync();
            Assert.Equal(3, movements.Count(m => m.PocketId == "p1"));
            Assert.Equal(100m, movements.Where(m => m.Currency == "DOP").Sum(m => m.Type == "ingreso" ? m.Amount : -m.Amount));
            Assert.Equal(500m, movements.Where(m => m.Currency == "USD").Sum(m => m.Type == "ingreso" ? m.Amount : -m.Amount));
            Assert.Equal(4, await db.Receipts.CountAsync());
            Assert.Equal(5, await db.Outbox.CountAsync());
        });
        Assert.True(JsonElement.DeepEquals(imported, await Initialize(alice)));
    }

    [Fact]
    public async Task EmptyCloseCreatesNoZeroMovementAndVersionsCannotOverflow()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice);
        await Json(await Send(alice, "POST", "/pockets", "empty", Pocket()), HttpStatusCode.Created);
        var closed = await Json(await Send(alice, "POST", "/pockets/p1/close", "close-empty", new { expectedVersion = "1" }));
        Assert.Equal(JsonValueKind.Null, closed.GetProperty("movement").ValueKind);
        await Json(await Send(alice, "POST", "/pockets", "overflow", Pocket(id: "overflow")), HttpStatusCode.Created);
        await Inspect(factory, async db => {
            (await db.Pockets.SingleAsync(p => p.Id == "overflow")).Version = long.MaxValue;
            await db.SaveChangesAsync();
        });
        Assert.Equal(HttpStatusCode.Conflict, (await Send(alice, "POST", "/pockets/overflow/close", "overflow-close", new { expectedVersion = long.MaxValue.ToString() })).StatusCode);
        await Inspect(factory, async db => {
            Assert.Empty(await db.Movements.Where(m => m.PocketId != null).ToArrayAsync());
            Assert.Null((await db.Pockets.SingleAsync(p => p.Id == "overflow")).ClosedAt);
            Assert.Equal(3, await db.Receipts.CountAsync());
        });
    }

    [Fact]
    public async Task ReceiptsAreStableAndBindTheOperationToItsPocket()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice);
        await Json(await Send(alice, "POST", "/pockets", "create-first", Pocket()), HttpStatusCode.Created);
        await Json(await Send(alice, "POST", "/pockets", "create-second", Pocket(id: "p2")), HttpStatusCode.Created);
        var first = await Json(await Send(alice, "POST", "/pockets/p1/deposit", "stable-deposit", new { amount = "10", expectedVersion = "1" }));
        await Json(await Send(alice, "POST", "/pockets/p1/deposit", "later-deposit", new { amount = "5", expectedVersion = "2" }));
        var retry = await Json(await Send(alice, "POST", "/pockets/p1/deposit", "stable-deposit", new { amount = "10", expectedVersion = "1" }));
        Assert.True(JsonElement.DeepEquals(first, retry));
        foreach (var route in new[] { "/pockets/p2/deposit", "/pockets/p1/withdraw" })
            Assert.Equal(HttpStatusCode.Conflict, (await Send(alice, "POST", route, "stable-deposit", new { amount = "10", expectedVersion = "1" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(alice, "POST", "/pockets/p1/deposit", "stale-version", new { amount = "1", expectedVersion = "1" })).StatusCode);
        await Inspect(factory, async db => {
            Assert.Equal(15m, (await db.Pockets.SingleAsync(p => p.Id == "p1")).CurrentAmount);
            Assert.Equal(0m, (await db.Pockets.SingleAsync(p => p.Id == "p2")).CurrentAmount);
            Assert.Equal(4, await db.Receipts.CountAsync());
            Assert.Equal(5, await db.Outbox.CountAsync());
        });
    }

    [Fact]
    public async Task OtherOwnerCannotReadOrMutatePocketAndCanReuseItsIdsAndKeys()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        using var bob = Client(factory, "bob");
        await Initialize(alice);
        await Initialize(bob);
        await Json(await Send(alice, "POST", "/pockets", "same-key", Pocket()), HttpStatusCode.Created);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(bob, "POST", "/pockets/p1/deposit", "foreign-deposit", new { amount = "5", expectedVersion = "1" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(bob, "POST", "/pockets/p1/close", "foreign-close", new { expectedVersion = "1" })).StatusCode);
        var bobBefore = await Json(await bob.GetAsync("/api/v2/finances"));
        Assert.Empty(bobBefore.GetProperty("snapshot").GetProperty("pockets").EnumerateArray());
        await Json(await Send(bob, "POST", "/pockets", "same-key", Pocket(currency: "USD")), HttpStatusCode.Created);
        await Json(await Send(bob, "POST", "/pockets/p1/deposit", "bob-deposit", new { amount = "200", expectedVersion = "1" }));
        await Inspect(factory, async db => {
            var pockets = await db.Pockets.ToArrayAsync();
            Assert.Equal(2, pockets.Length);
            Assert.Equal(0m, pockets.Single(p => p.UserId == Alice).CurrentAmount);
            Assert.Equal(200m, pockets.Single(p => p.UserId != Alice).CurrentAmount);
        });
    }

    [Fact]
    public async Task ConcurrentDepositsToDifferentPocketsCannotOverspendTheSameCurrency()
    {
        await using var factory = new ApiFactory();
        using var first = Client(factory, "alice");
        using var second = Client(factory, "alice");
        await Initialize(first);
        await Json(await Send(first, "POST", "/pockets", "create-one", Pocket()), HttpStatusCode.Created);
        await Json(await Send(first, "POST", "/pockets", "create-two", Pocket(id: "p2")), HttpStatusCode.Created);
        var results = await Task.WhenAll(
            Send(first, "POST", "/pockets/p1/deposit", "deposit-one", new { amount = "80", expectedVersion = "1" }),
            Send(second, "POST", "/pockets/p2/deposit", "deposit-two", new { amount = "80", expectedVersion = "1" }));
        try
        {
            Assert.Single(results, result => result.StatusCode == HttpStatusCode.OK);
            Assert.Single(results, result => result.StatusCode == HttpStatusCode.Conflict);
        }
        finally { foreach (var result in results) result.Dispose(); }
        await Inspect(factory, async db => {
            var pockets = await db.Pockets.ToArrayAsync();
            Assert.Equal(80m, pockets.Sum(p => p.CurrentAmount));
            var movements = await db.Movements.ToArrayAsync();
            Assert.Single(movements, m => m.PocketId != null);
            Assert.Equal(20m, movements.Where(m => m.Currency == "DOP").Sum(m => m.Type == "ingreso" ? m.Amount : -m.Amount));
            Assert.Equal(500m, movements.Where(m => m.Currency == "USD").Sum(m => m.Type == "ingreso" ? m.Amount : -m.Amount));
            Assert.Equal(3, await db.Receipts.CountAsync());
            Assert.Equal(4, await db.Outbox.CountAsync());
        });
    }

    private static object Pocket(string id = "p1", string currency = "DOP", string amount = "1000") =>
        new { id, name = "Meta", currency, targetAmount = amount, emoji = "🎯", color = "#123456" };

    private static HttpClient Client(ApiFactory factory, string owner)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", owner);
        return client;
    }

    private static async Task<HttpResponseMessage> Send(HttpClient client, string method, string path, string key, object body)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), "/api/v2" + path) { Content = JsonContent.Create(body) };
        request.Headers.Add("Idempotency-Key", key);
        return await client.SendAsync(request);
    }

    private static async Task<JsonElement> Initialize(HttpClient client)
    {
        using var response = await Send(client, "POST", "/imports/legacy", "import-key", new {
            expectedRevision = "0", snapshot = new {
                version = 1,
                transactions = new[] {
                    new { id = "income-dop", currency = "DOP", amount = 100m, type = "ingreso", category = "salario", date = "2026-11-13T12:00:00Z" },
                    new { id = "income-usd", currency = "USD", amount = 500m, type = "ingreso", category = "salario", date = "2026-11-13T12:00:00Z" },
                }, pockets = Array.Empty<object>(),
            },
        });
        return await Json(response);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response, HttpStatusCode status = HttpStatusCode.OK)
    {
        Assert.Equal(status, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.Clone();
    }

    private static async Task Inspect(ApiFactory factory, Func<NormalizedFinanceDb, Task> assertion)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await assertion(scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>());
    }
}
