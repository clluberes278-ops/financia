using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Financia.Api.Tests;

public sealed class MovementLifecycleTests
{
    private const string Root = "/api/v2/movements";

    [Fact]
    public async Task PatchUpdatesAllEditableFieldsWithNewVersionAndAtomicReceiptAndEvent()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice, [Movement("m1", 1000m)]);
        var request = Update(amount: "25.50");
        request["currency"] = "USD";
        request["type"] = "gasto";
        request["category"] = "comida";
        request["note"] = "Almuerzo corregido";
        using var response = await Patch(alice, "m1", "edit-first", request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await Json(response);
        Assert.Equal("2", json.GetProperty("revision").GetString());
        var movement = json.GetProperty("movement");
        Assert.Equal("m1", movement.GetProperty("id").GetString());
        Assert.Equal("2", movement.GetProperty("version").GetString());
        Assert.Equal("25.50", movement.GetProperty("amount").GetString());
        Assert.Equal("USD", movement.GetProperty("currency").GetString());
        Assert.Equal("gasto", movement.GetProperty("type").GetString());
        Assert.Equal("comida", movement.GetProperty("category").GetString());
        Assert.Equal("Almuerzo corregido", movement.GetProperty("note").GetString());
        Assert.Equal("2026-11-14T16:00:00.0000000Z", movement.GetProperty("date").GetString());
        await Inspect(factory, async db => {
            var saved = await db.Movements.SingleAsync();
            Assert.Equal(2, saved.Version);
            Assert.Equal(25.50m, saved.Amount);
            Assert.Null(saved.DeletedAt);
            Assert.Single(await db.Receipts.ToArrayAsync());
            Assert.Equal(new long[] { 1, 2 }, await db.Outbox.OrderBy(x => x.Revision).Select(x => x.Revision).ToArrayAsync());
            Assert.Equal(2, (await db.Accounts.SingleAsync()).Revision);
        });
    }

    [Fact]
    public async Task PatchRetryReturnsOriginalResultAfterLaterEditAndPathIsPartOfIdentity()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice, [Movement("m1", 1000m), Movement("m2", 100m)]);
        using var firstResponse = await Patch(alice, "m1", "stable-edit", Update(amount: "900.00"));
        var first = await Json(firstResponse);
        using var later = await Patch(alice, "m1", "later-edit", Update(version: "2", amount: "800.00"));
        Assert.Equal(HttpStatusCode.OK, later.StatusCode);
        using var retryResponse = await Patch(alice, "m1", "stable-edit", Update(amount: "900.00"));
        Assert.Equal(HttpStatusCode.OK, retryResponse.StatusCode);
        Assert.True(JsonElement.DeepEquals(first, await Json(retryResponse)));
        using var changedBody = await Patch(alice, "m1", "stable-edit", Update(amount: "700.00"));
        Assert.Equal(HttpStatusCode.Conflict, changedBody.StatusCode);
        using var changedPath = await Patch(alice, "m2", "stable-edit", Update(amount: "900.00"));
        Assert.Equal(HttpStatusCode.Conflict, changedPath.StatusCode);
        await Inspect(factory, async db => {
            Assert.Equal(2, await db.Receipts.CountAsync());
            Assert.Equal(3, await db.Outbox.CountAsync());
            var saved = await db.Movements.SingleAsync(x => x.Id == "m1");
            Assert.Equal(800m, saved.Amount);
            Assert.Equal(3, saved.Version);
            Assert.Equal(3, (await db.Accounts.SingleAsync()).Revision);
        });
    }

    [Fact]
    public async Task DeleteIsLogicalHiddenFromReadsAndRetryDoesNotCreateAnotherEvent()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice, [Movement("m1", 100m), Movement("m2", 50m)]);
        using var deletedResponse = await Delete(alice, "m1", "delete-first", "1");
        Assert.Equal(HttpStatusCode.OK, deletedResponse.StatusCode);
        var deleted = await Json(deletedResponse);
        Assert.True(deleted.GetProperty("deleted").GetBoolean());
        Assert.Equal("m1", deleted.GetProperty("id").GetString());
        Assert.Equal("2", deleted.GetProperty("version").GetString());
        Assert.Equal("2", deleted.GetProperty("revision").GetString());
        using var retry = await Delete(alice, "m1", "delete-first", "1");
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.True(JsonElement.DeepEquals(deleted, await Json(retry)));
        using var changedPath = await Delete(alice, "m2", "delete-first", "1");
        Assert.Equal(HttpStatusCode.Conflict, changedPath.StatusCode);
        using var currentResponse = await alice.GetAsync("/api/v2/finances");
        var current = await Json(currentResponse);
        var visible = Assert.Single(current.GetProperty("snapshot").GetProperty("transactions").EnumerateArray());
        Assert.Equal("m2", visible.GetProperty("id").GetString());
        using var recreate = await Send(alice, HttpMethod.Post, Root, "recreate-deleted", new {
            id = "m1", currency = "DOP", amount = "100.00", type = "ingreso", category = "salario", date = "2026-11-14T12:00:00Z"
        });
        Assert.Equal(HttpStatusCode.Conflict, recreate.StatusCode);
        await Inspect(factory, async db => {
            var historical = await db.Movements.SingleAsync(x => x.Id == "m1");
            Assert.NotNull(historical.DeletedAt);
            Assert.Equal(2, historical.Version);
            Assert.Equal(2, await db.Movements.CountAsync());
            Assert.Single(await db.Receipts.ToArrayAsync());
            Assert.Equal(2, await db.Outbox.CountAsync());
        });
    }

    [Fact]
    public async Task ForeignOwnersAndAnonymousRequestsCannotMutateAnExistingMovement()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        using var bob = Client(factory, "bob");
        using var anonymous = factory.CreateClient();
        await Initialize(alice, [Movement("private-id", 100m)]);
        await Initialize(bob, []);
        using var anonymousPatch = await Patch(anonymous, "private-id", "anonymous-edit", Update());
        using var anonymousDelete = await Delete(anonymous, "private-id", "anonymous-delete", "1");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousPatch.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousDelete.StatusCode);
        using var foreignPatch = await Patch(bob, "private-id", "foreign-edit", Update());
        using var foreignDelete = await Delete(bob, "private-id", "foreign-delete", "1");
        Assert.Equal(HttpStatusCode.NotFound, foreignPatch.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, foreignDelete.StatusCode);
        await Inspect(factory, async db => {
            var movement = await db.Movements.SingleAsync();
            Assert.Equal(100m, movement.Amount);
            Assert.Equal(1, movement.Version);
            Assert.Null(movement.DeletedAt);
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Equal(2, await db.Outbox.CountAsync());
        });
    }

    [Fact]
    public async Task InvalidCommandsAndStaleVersionsLeaveHistoryUnchanged()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice, [Movement("m1", 100m)]);
        var invalid = new List<Dictionary<string, object?>>();
        foreach (var pair in new (string Field, object? Value)[] {
            ("expectedVersion", "abc"), ("expectedVersion", "1.5"), ("expectedVersion", "-1"),
            ("amount", "1.001"), ("amount", "0"), ("amount", "-1"), ("amount", 25m),
            ("currency", "EUR"), ("date", "2026-11-14T12:00:00"), ("pocketId", "p1"), ("userId", "someone-else"),
        })
        {
            var request = Update();
            request[pair.Field] = pair.Value;
            invalid.Add(request);
        }
        for (var index = 0; index < invalid.Count; index++)
        {
            using var response = await Patch(alice, "m1", "invalid-edit-" + index, invalid[index]);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        foreach (var version in new[] { "abc", "1.5", "-1", "" })
        {
            using var response = await Delete(alice, "m1", "invalid-delete-" + version, version);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        using var stalePatch = await Patch(alice, "m1", "stale-edit", Update(version: "2"));
        using var staleDelete = await Delete(alice, "m1", "stale-delete", "2");
        Assert.Equal(HttpStatusCode.Conflict, stalePatch.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, staleDelete.StatusCode);
        using var missingKey = new HttpRequestMessage(HttpMethod.Patch, Root + "/m1") { Content = JsonContent.Create(Update()) };
        using var noKeyResponse = await alice.SendAsync(missingKey);
        Assert.Equal(HttpStatusCode.BadRequest, noKeyResponse.StatusCode);
        await Inspect(factory, async db => {
            Assert.Equal(100m, (await db.Movements.SingleAsync()).Amount);
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Single(await db.Outbox.ToArrayAsync());
            Assert.Equal(1, (await db.Accounts.SingleAsync()).Revision);
        });
    }

    [Fact]
    public async Task InternalTransfersAndSavingsCategoryCannotBeEditedOrDeletedDirectly()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice, [Movement("income", 1000m), Movement("transfer", 800m, "gasto", "ahorro", "p1"),
            Movement("historical-saving", 20m, "gasto", "ahorro")], [Pocket(800m)]);
        foreach (var id in new[] { "transfer", "historical-saving" })
        {
            using var patch = await Patch(alice, id, "edit-" + id, Update());
            using var delete = await Delete(alice, id, "delete-" + id, "1");
            Assert.Equal(HttpStatusCode.Conflict, patch.StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, delete.StatusCode);
        }
        await Inspect(factory, async db => {
            Assert.Equal(800m, (await db.Pockets.SingleAsync()).CurrentAmount);
            Assert.All(await db.Movements.ToArrayAsync(), movement => { Assert.Equal(1, movement.Version); Assert.Null(movement.DeletedAt); });
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Single(await db.Outbox.ToArrayAsync());
        });
    }

    [Fact]
    public async Task EditingOrDeletingIncomeCannotUndermineSavedFundsInThatCurrency()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        await Initialize(alice, [Movement("income", 1000m), Movement("transfer", 800m, "gasto", "ahorro", "p1")], [Pocket(800m)]);
        using var decreased = await Patch(alice, "income", "reduce-income", Update(amount: "500.00"));
        using var deleted = await Delete(alice, "income", "delete-income", "1");
        Assert.Equal(HttpStatusCode.Conflict, decreased.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, deleted.StatusCode);
        await Inspect(factory, async db => {
            Assert.Equal(1000m, (await db.Movements.SingleAsync(x => x.Id == "income")).Amount);
            Assert.Equal(800m, (await db.Pockets.SingleAsync()).CurrentAmount);
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Equal(1, (await db.Accounts.SingleAsync()).Revision);
        });
        using var allowed = await Patch(alice, "income", "safe-reduction", Update(amount: "900.00"));
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
    }

    [Fact]
    public async Task NegativeAvailableBalanceCanBeRecordedWhenNoSavingsExistInAffectedCurrency()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        // DOP savings must not constrain an ordinary USD expense correction.
        var usdExpense = Movement("usd-expense", 10m, "gasto");
        usdExpense["currency"] = "USD";
        await Initialize(alice, [Movement("income", 1000m), Movement("transfer", 800m, "gasto", "ahorro", "p1"), usdExpense], [Pocket(800m)]);
        var update = Update(amount: "2000.00");
        update["currency"] = "USD";
        update["type"] = "gasto";
        update["category"] = "comida";
        update["note"] = null;
        using var edited = await Patch(alice, "usd-expense", "larger-usd-expense", update);
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        var json = await Json(edited);
        Assert.Equal("2000.00", json.GetProperty("movement").GetProperty("amount").GetString());
        await Inspect(factory, async db => {
            Assert.Equal(800m, (await db.Pockets.SingleAsync()).CurrentAmount);
            Assert.Equal(2000m, (await db.Movements.SingleAsync(x => x.Id == "usd-expense")).Amount);
        });
    }

    private static HttpClient Client(ApiFactory factory, string owner)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", owner);
        return client;
    }

    private static Dictionary<string, object?> Update(string version = "1", string amount = "100.00") => new() {
        ["expectedVersion"] = version, ["currency"] = "DOP", ["amount"] = amount, ["type"] = "ingreso",
        ["category"] = "salario", ["date"] = "2026-11-14T12:00:00-04:00", ["note"] = null,
    };

    private static Dictionary<string, object?> Movement(string id, decimal amount, string type = "ingreso", string category = "salario", string? pocket = null) => new() {
        ["id"] = id, ["currency"] = "DOP", ["amount"] = amount, ["type"] = type, ["category"] = category,
        ["date"] = "2026-11-14T12:00:00Z", ["pocketId"] = pocket,
    };

    private static object Pocket(decimal saved) => new {
        id = "p1", name = "Reserva", currency = "DOP", targetAmount = 2000m, currentAmount = saved,
        emoji = "R", createdAt = "2026-11-01T12:00:00Z"
    };

    private static async Task Initialize(HttpClient client, object[] transactions, object[]? pockets = null)
    {
        using var response = await Send(client, HttpMethod.Post, "/api/v2/imports/legacy", "import-key", new {
            expectedRevision = "0", snapshot = new { version = 1, transactions, pockets = pockets ?? [] }
        });
        response.EnsureSuccessStatusCode();
    }

    private static Task<HttpResponseMessage> Patch(HttpClient client, string id, string key, object body) =>
        Send(client, HttpMethod.Patch, Root + "/" + Uri.EscapeDataString(id), key, body);

    private static Task<HttpResponseMessage> Delete(HttpClient client, string id, string key, string version) =>
        Send(client, HttpMethod.Delete, Root + "/" + Uri.EscapeDataString(id) + "?expectedVersion=" + Uri.EscapeDataString(version), key);

    private static async Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string route, string key, object? body = null)
    {
        using var request = new HttpRequestMessage(method, route);
        if (body is not null) request.Content = JsonContent.Create(body);
        request.Headers.Add("Idempotency-Key", key);
        return await client.SendAsync(request);
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
