using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Financia.Api.Tests;

public sealed class MovementCommandTests
{
    private const string Path = "/api/v2/movements";
    private static readonly Guid Alice = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Bob = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task RequiresAuthenticationInitializationAndEnabledV2()
    {
        await using var factory = new ApiFactory();
        using var anonymous = factory.CreateClient();
        using var denied = await Send(anonymous, "anonymous", Body());
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        using var alice = Client(factory, "alice");
        using var uninitialized = await Send(alice, "before-import", Body());
        Assert.Equal(HttpStatusCode.Conflict, uninitialized.StatusCode);
        await Inspect(factory, async db => {
            Assert.Empty(await db.Movements.ToArrayAsync());
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Empty(await db.Outbox.ToArrayAsync());
        });
        await using var disabledFactory = new ApiFactory(financeV2Enabled: false);
        using var disabled = Client(disabledFactory, "alice");
        using var unavailable = await Send(disabled, "disabled", Body());
        Assert.Equal(HttpStatusCode.NotFound, unavailable.StatusCode);
    }

    [Fact]
    public async Task CreatesCanonicalMoneyUtcDateReceiptAndOutboxAtomically()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice);
        using var incomeResponse = await Send(alice, "income", Body(id: "income-local", amount: "1250.5"));
        Assert.Equal(HttpStatusCode.Created, incomeResponse.StatusCode);
        var income = await Json(incomeResponse);
        Assert.Equal("2", income.GetProperty("revision").GetString());
        var movement = income.GetProperty("movement");
        Assert.Equal("1250.50", movement.GetProperty("amount").GetString());
        Assert.Equal("DOP", movement.GetProperty("currency").GetString());
        Assert.Equal("1", movement.GetProperty("version").GetString());
        Assert.Equal("2026-11-13T16:30:00.0000000Z", movement.GetProperty("date").GetString());
        Assert.False(movement.TryGetProperty("pocketId", out _));
        var expenseBody = Body(id: "expense-usd", amount: "12.34", currency: "USD");
        expenseBody["type"] = "gasto";
        expenseBody["category"] = "comida";
        expenseBody["note"] = "Almuerzo";
        using var expenseResponse = await Send(alice, "expense", expenseBody);
        Assert.Equal(HttpStatusCode.Created, expenseResponse.StatusCode);
        Assert.Equal("3", (await Json(expenseResponse)).GetProperty("revision").GetString());
        await Inspect(factory, async db => {
            var rows = await db.Movements.OrderBy(x => x.Id).ToArrayAsync();
            Assert.Equal(2, rows.Length);
            Assert.All(rows, row => Assert.Equal(Alice, row.UserId));
            Assert.Equal(12.34m, rows.Single(x => x.Id == "expense-usd").Amount);
            Assert.Equal(1250.5m, rows.Single(x => x.Id == "income-local").Amount);
            Assert.Equal(3, (await db.Accounts.SingleAsync()).Revision);
            var receipts = await db.Receipts.ToArrayAsync();
            Assert.Equal(2, receipts.Length);
            Assert.All(receipts, receipt => {
                Assert.Equal(Alice, receipt.UserId);
                Assert.Equal(201, receipt.StatusCode);
                Assert.Equal("movement.create", receipt.Operation);
            });
            var events = await db.Outbox.OrderBy(x => x.Revision).ToArrayAsync();
            Assert.Equal(new long[] { 1, 2, 3 }, events.Select(x => x.Revision).ToArray());
            Assert.All(events, item => { Assert.Equal(Alice, item.UserId); Assert.Null(item.PublishedAt); });
        });
    }

    [Fact]
    public async Task ExactRetryReturnsOriginalReceiptAfterOtherWrites()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice);
        using var firstResponse = await Send(alice, "stable-key", Body(id: "first"));
        var first = await Json(firstResponse);
        using var later = await Send(alice, "later-key", Body(id: "later", amount: "75.00"));
        Assert.Equal(HttpStatusCode.Created, later.StatusCode);
        using var retryResponse = await Send(alice, "stable-key", Body(id: "first"));
        Assert.Equal(HttpStatusCode.Created, retryResponse.StatusCode);
        Assert.True(JsonElement.DeepEquals(first, await Json(retryResponse)));
        Assert.Equal("2", first.GetProperty("revision").GetString());
        using var currentResponse = await alice.GetAsync("/api/v2/finances");
        var current = await Json(currentResponse);
        Assert.Equal("3", current.GetProperty("revision").GetString());
        Assert.Equal(2, current.GetProperty("snapshot").GetProperty("transactions").GetArrayLength());
        await Inspect(factory, async db => {
            Assert.Equal(2, await db.Receipts.CountAsync());
            Assert.Equal(3, await db.Outbox.CountAsync());
        });
    }

    [Fact]
    public async Task ReusedKeysAndDuplicateIdsDoNotChangeConfirmedHistory()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice);
        using var first = await Send(alice, "used-key", Body(id: "existing"));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        foreach (var attempt in new[] {
            (Key: "used-key", Request: Body(id: "existing", amount: "2.00")),
            (Key: "another-key", Request: Body(id: "existing")),
            (Key: "import-key", Request: Body(id: "new-id")),
        })
        {
            using var response = await Send(alice, attempt.Key, attempt.Request);
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        }
        await Inspect(factory, async db => {
            Assert.Single(await db.Movements.ToArrayAsync());
            Assert.Single(await db.Receipts.ToArrayAsync());
            Assert.Equal(2, await db.Outbox.CountAsync());
            Assert.Equal(2, (await db.Accounts.SingleAsync()).Revision);
        });
    }

    [Fact]
    public async Task InvalidMoneyDatesAndClientSuppliedOwnershipOrPocketNeverPersist()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice);
        var attempts = new List<Dictionary<string, object?>>();
        foreach (var amount in new[] { "0", "-1", "1.001", "1,250.00", "1e2", "NaN", "1000000000000.00" })
            attempts.Add(Body(amount: amount));
        foreach (var pair in new (string Field, object? Value)[] {
            ("id", ""), ("currency", "EUR"), ("type", "transferencia"), ("category", "unknown"),
            ("date", "2026-11-13T12:30:00"), ("date", "invalid"), ("amount", 25m),
            ("pocketId", "some-pocket"), ("userId", Bob.ToString()),
        })
        {
            var body = Body();
            body[pair.Field] = pair.Value;
            attempts.Add(body);
        }
        for (var index = 0; index < attempts.Count; index++)
        {
            using var response = await Send(alice, "invalid-" + index, attempts[index]);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        using var missingKey = await alice.PostAsJsonAsync(Path, Body());
        Assert.Equal(HttpStatusCode.BadRequest, missingKey.StatusCode);
        await Inspect(factory, async db => {
            Assert.Empty(await db.Movements.ToArrayAsync());
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Single(await db.Outbox.ToArrayAsync());
            Assert.Equal(1, (await db.Accounts.SingleAsync()).Revision);
        });
    }

    [Fact]
    public async Task OwnersCanUseSameIdsAndKeysWithoutSeeingEachOthersData()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        using var bob = Client(factory, "bob");
        await Initialize(alice);
        await Initialize(bob);
        using var aliceWrite = await Send(alice, "same-key", Body(id: "same-id", amount: "25.50"));
        using var bobWrite = await Send(bob, "same-key", Body(id: "same-id", amount: "80.00", currency: "USD"));
        Assert.Equal(HttpStatusCode.Created, aliceWrite.StatusCode);
        Assert.Equal(HttpStatusCode.Created, bobWrite.StatusCode);
        foreach (var owner in new[] { (Client: alice, Amount: "25.50"), (Client: bob, Amount: "80.00") })
        {
            using var response = await owner.Client.GetAsync("/api/v2/finances");
            var json = await Json(response);
            var movement = Assert.Single(json.GetProperty("snapshot").GetProperty("transactions").EnumerateArray());
            Assert.Equal(owner.Amount, movement.GetProperty("amount").GetString());
        }
        await Inspect(factory, async db => {
            Assert.Equal(2, await db.Receipts.CountAsync());
            Assert.Equal(4, await db.Outbox.CountAsync());
            Assert.Equal(25.5m, (await db.Movements.SingleAsync(x => x.UserId == Alice)).Amount);
            Assert.Equal(80m, (await db.Movements.SingleAsync(x => x.UserId == Bob)).Amount);
        });
    }

    [Fact]
    public async Task ImportRetryPreservesInitialSnapshotEvenWhenUpgradedAccountWritesLater()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        var initial = await Initialize(alice);
        // Simulate an account imported by the previous schema, before response receipts existed.
        await Inspect(factory, async db => {
            var account = await db.Accounts.SingleAsync();
            account.ImportResponseJson = null;
            await db.SaveChangesAsync();
        });
        using var created = await Send(alice, "after-upgrade", Body());
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var retriedImport = await Initialize(alice);
        Assert.True(JsonElement.DeepEquals(initial, retriedImport));
        Assert.Equal("1", retriedImport.GetProperty("revision").GetString());
        Assert.Empty(retriedImport.GetProperty("snapshot").GetProperty("transactions").EnumerateArray());
        using var currentResponse = await alice.GetAsync("/api/v2/finances");
        var current = await Json(currentResponse);
        Assert.Equal("2", current.GetProperty("revision").GetString());
        Assert.Single(current.GetProperty("snapshot").GetProperty("transactions").EnumerateArray());
    }

    [Fact]
    public async Task SimultaneousRetriesCommitOnlyOneMovementAndEvent()
    {
        await using var factory = new ApiFactory();
        using var firstClient = Client(factory, "alice");
        using var secondClient = Client(factory, "alice");
        await Initialize(firstClient);
        var responses = await Task.WhenAll(Send(firstClient, "concurrent", Body()), Send(secondClient, "concurrent", Body()));
        try
        {
            Assert.All(responses, response => Assert.True(response.StatusCode is HttpStatusCode.Created or HttpStatusCode.Conflict,
                $"Unexpected response: {response.StatusCode}"));
        }
        finally { foreach (var response in responses) response.Dispose(); }
        using var retry = await Send(firstClient, "concurrent", Body());
        Assert.Equal(HttpStatusCode.Created, retry.StatusCode);
        await Inspect(factory, async db => {
            Assert.Single(await db.Movements.ToArrayAsync());
            Assert.Single(await db.Receipts.ToArrayAsync());
            Assert.Equal(new long[] { 1, 2 }, await db.Outbox.OrderBy(x => x.Revision).Select(x => x.Revision).ToArrayAsync());
            Assert.Equal(2, (await db.Accounts.SingleAsync()).Revision);
        });
    }

    private static HttpClient Client(ApiFactory factory, string owner)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", owner);
        return client;
    }

    private static Dictionary<string, object?> Body(string id = "manual-id", string amount = "25.50", string currency = "DOP") => new() {
        ["id"] = id, ["currency"] = currency, ["amount"] = amount, ["type"] = "ingreso",
        ["category"] = "salario", ["date"] = "2026-11-13T12:30:00-04:00",
    };

    private static async Task<HttpResponseMessage> Send(HttpClient client, string key, object body, string route = Path)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, route) { Content = JsonContent.Create(body) };
        request.Headers.Add("Idempotency-Key", key);
        return await client.SendAsync(request);
    }

    private static async Task<JsonElement> Initialize(HttpClient client)
    {
        using var response = await Send(client, "import-key", new {
            expectedRevision = "0", snapshot = new { version = 1, transactions = Array.Empty<object>(), pockets = Array.Empty<object>() }
        }, "/api/v2/imports/legacy");
        return await Json(response);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.Clone();
    }

    private static async Task Inspect(ApiFactory factory, Func<NormalizedFinanceDb, Task> assertion)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await assertion(scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>());
    }
}
