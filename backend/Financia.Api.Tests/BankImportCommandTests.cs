using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Financia.Api;
using Financia.Api.Features;
using Financia.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Financia.Api.Tests;

public sealed class BankImportCommandTests
{
    private static readonly Guid Alice = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Bob = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private const string Path = "/api/v2/imports/bank";

    [Fact]
    public async Task ImportSkipsEditedAndDeletedIdsAndReplaysOriginalReceiptPerUser()
    {
        await using var factory = new ApiFactory();
        using var alice = Client(factory, "alice");
        using var bob = Client(factory, "bob");
        await Seed(factory, Alice);
        await Seed(factory, Bob);
        await Inspect(factory, async db =>
        {
            db.Movements.Add(new NormalizedMovement { UserId = Alice, Id = "gmail:edited", Currency = "DOP", Amount = 25,
                Type = "gasto", Category = "comida", Note = "Edited by owner", OccurredAt = DateTime.UtcNow, Version = 4 });
            db.Movements.Add(new NormalizedMovement { UserId = Alice, Id = "gmail:deleted", Currency = "DOP", Amount = 20,
                Type = "gasto", Category = "comida", OccurredAt = DateTime.UtcNow, DeletedAt = DateTime.UtcNow, Version = 2 });
            await db.SaveChangesAsync();
        });
        var request = new BankImportRequest([Input("edited", 999), Input("deleted", 999), Input("new", 50)]);
        using var first = await Send(alice, "same-key", request);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var receipt = await first.Content.ReadAsStringAsync();
        using var result = JsonDocument.Parse(receipt);
        Assert.Equal(1, result.RootElement.GetProperty("imported").GetInt32());
        Assert.Equal(2, result.RootElement.GetProperty("skipped").GetInt32());
        using var retry = await Send(alice, "same-key", request);
        Assert.Equal(receipt, await retry.Content.ReadAsStringAsync());
        using var bobResponse = await Send(bob, "same-key", request);
        Assert.Equal(HttpStatusCode.OK, bobResponse.StatusCode);
        using var bobResult = JsonDocument.Parse(await bobResponse.Content.ReadAsStringAsync());
        Assert.Equal(3, bobResult.RootElement.GetProperty("imported").GetInt32());
        await Inspect(factory, async db =>
        {
            var edited = await db.Movements.SingleAsync(m => m.UserId == Alice && m.Id == "gmail:edited");
            Assert.Equal(25, edited.Amount); Assert.Equal(4, edited.Version); Assert.Equal("Edited by owner", edited.Note);
            Assert.NotNull((await db.Movements.SingleAsync(m => m.UserId == Alice && m.Id == "gmail:deleted")).DeletedAt);
            Assert.Equal(1, (await db.Movements.SingleAsync(m => m.UserId == Alice && m.Id == "gmail:new")).Version);
            Assert.Equal(2, await db.Receipts.CountAsync());
            Assert.Equal(2, await db.Outbox.CountAsync());
        });
        using var nextImport = await Send(alice, "new-key", request);
        Assert.Equal(HttpStatusCode.OK, nextImport.StatusCode);
        using var nextResult = JsonDocument.Parse(await nextImport.Content.ReadAsStringAsync());
        Assert.Equal(0, nextResult.RootElement.GetProperty("imported").GetInt32());
        Assert.Equal(3, nextResult.RootElement.GetProperty("skipped").GetInt32());
    }

    [Fact]
    public async Task BatchThatConsumesReservedMoneyIsRejectedAtomically()
    {
        await using var factory = new ApiFactory();
        using var client = Client(factory, "alice");
        await Seed(factory, Alice);
        await Inspect(factory, async db =>
        {
            db.Pockets.Add(new NormalizedPocket { UserId = Alice, Id = "p", Name = "Ahorro", Currency = "DOP", TargetAmount = 100,
                CurrentAmount = 20, Emoji = "", CreatedAt = DateTime.UtcNow, Version = 1 });
            db.Movements.Add(new NormalizedMovement { UserId = Alice, Id = "initial", Currency = "DOP", Amount = 100,
                Type = "ingreso", Category = "salario", OccurredAt = DateTime.UtcNow, Version = 1 });
            await db.SaveChangesAsync();
        });
        using var response = await Send(client, "batch", new BankImportRequest([Input("income", 10) with { Type = "ingreso" }, Input("expense", 200)]));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await Inspect(factory, async db =>
        {
            Assert.Single(await db.Movements.ToArrayAsync());
            Assert.Equal(20, (await db.Pockets.SingleAsync()).CurrentAmount);
            Assert.Equal(1, (await db.Accounts.SingleAsync()).Revision);
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Empty(await db.Outbox.ToArrayAsync());
        });
    }

    [Fact]
    public async Task InvalidBatchNeverPartiallyImportsAndRequiresAuthentication()
    {
        await using var factory = new ApiFactory();
        using var anonymous = factory.CreateClient();
        using var denied = await Send(anonymous, "anon", new BankImportRequest([Input("good", 1)]));
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        using var client = Client(factory, "alice");
        await Seed(factory, Alice);
        foreach (var bad in new[] {
            Input("bad", 1) with { Id = "other:bad" }, Input("bad", 1) with { PocketId = "p" },
            Input("bad", 1) with { Category = "ahorro" }, Input("bad", 1) with { Date = "2026-11-14T12:00:00" },
            Input("bad", 1.001m), Input("good", 1),
        })
        {
            using var response = await Send(client, "invalid", new BankImportRequest([Input("good", 1), bad]));
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        using var oversized = await Send(client, "too-many", new BankImportRequest(Enumerable.Range(0, 1001).Select(index => Input(index.ToString(), 1)).ToArray()));
        Assert.Equal(HttpStatusCode.BadRequest, oversized.StatusCode);
        await Inspect(factory, async db =>
        {
            Assert.Empty(await db.Movements.ToArrayAsync());
            Assert.Empty(await db.Receipts.ToArrayAsync());
            Assert.Empty(await db.Outbox.ToArrayAsync());
        });
    }

    private static Movement Input(string id, decimal amount) => new("gmail:" + id, "DOP", amount, "gasto", "comida", "2026-11-14T12:00:00-04:00", null, null);
    private static HttpClient Client(ApiFactory factory, string owner)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", owner);
        return client;
    }
    private static async Task<HttpResponseMessage> Send(HttpClient client, string key, BankImportRequest body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Path) { Content = JsonContent.Create(body) };
        request.Headers.Add("Idempotency-Key", key);
        return await client.SendAsync(request);
    }
    private static Task Seed(ApiFactory factory, Guid owner) => Inspect(factory, async db =>
    {
        db.Accounts.Add(new FinanceAccount { UserId = owner, Revision = 1, ImportKey = "initial", ImportHash = "test" });
        await db.SaveChangesAsync();
    });
    private static async Task Inspect(ApiFactory factory, Func<NormalizedFinanceDb, Task> action)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await action(scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>());
    }
}
