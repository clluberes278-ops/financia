using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Financia.Api;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Financia.Api.Tests;

public class NormalizedFinanceApiTests
{
    private const string ReadPath = "/api/v2/finances";
    private const string ImportPath = "/api/v2/imports/legacy";

    [Fact]
    public async Task RequiresAuthenticationForReadingAndImporting()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(ReadPath)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Import(client, "anonymous", LocalImport())).StatusCode);
    }

    [Fact]
    public async Task FeatureFlagKeepsV2UnavailableWhenDisabled()
    {
        await using var factory = new ApiFactory(financeV2Enabled: false);
        using var client = SignedInClient(factory, "alice");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(ReadPath)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Import(client, "disabled", LocalImport())).StatusCode);
        (await client.GetAsync("/api/finances")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task ImportsBothCurrenciesOriginalIdsColorAndPocketBalanceWithoutRecalculation()
    {
        await using var factory = new ApiFactory();
        using var client = SignedInClient(factory, "alice");
        await AssertEmpty(client);

        var imported = await Import(client, "mixed-currencies", LocalImport());
        imported.EnsureSuccessStatusCode();
        var saved = await ReadJson(imported);
        Assert.Equal("1", saved.GetProperty("revision").GetString());

        var loaded = await ReadJson(await client.GetAsync(ReadPath));
        Assert.Equal("1", loaded.GetProperty("revision").GetString());
        var snapshot = loaded.GetProperty("snapshot");
        Assert.Equal(2, snapshot.GetProperty("version").GetInt32());
        var movements = snapshot.GetProperty("transactions").EnumerateArray().ToDictionary(x => x.GetProperty("id").GetString()!);
        Assert.Equal(3, movements.Count);
        Assert.Equal("1500.25", movements["income-local-1"].GetProperty("amount").GetString());
        Assert.Equal("DOP", movements["income-local-1"].GetProperty("currency").GetString());
        Assert.Equal("25.50", movements["gmail:bank:message-1"].GetProperty("amount").GetString());
        Assert.Equal("USD", movements["gmail:bank:message-1"].GetProperty("currency").GetString());
        Assert.Equal("pocket-local-1", movements["transfer-local-1"].GetProperty("pocketId").GetString());
        Assert.Equal("Reserva", movements["transfer-local-1"].GetProperty("note").GetString());
        Assert.All(movements.Values, movement => Assert.Equal("1", movement.GetProperty("version").GetString()));
        Assert.All(movements.Values, movement => Assert.EndsWith("Z", movement.GetProperty("date").GetString()));
        var pocket = Assert.Single(snapshot.GetProperty("pockets").EnumerateArray());
        Assert.Equal("pocket-local-1", pocket.GetProperty("id").GetString());
        Assert.Equal("3000.00", pocket.GetProperty("targetAmount").GetString());
        // Historic pocket balance deliberately differs from this snapshot's transfer sum.
        Assert.Equal("175.50", pocket.GetProperty("currentAmount").GetString());
        Assert.Equal("#123456", pocket.GetProperty("color").GetString());
        Assert.Equal("1", pocket.GetProperty("version").GetString());
        Assert.EndsWith("Z", pocket.GetProperty("createdAt").GetString());
    }

    [Fact]
    public async Task SeparatesOwnersAndScopesIdempotencyKeysToTheOwner()
    {
        await using var factory = new ApiFactory();
        using var alice = SignedInClient(factory, "alice");
        using var bob = SignedInClient(factory, "bob");
        (await Import(alice, "shared-key", LocalImport())).EnsureSuccessStatusCode();
        await AssertEmpty(bob);
        (await Import(bob, "shared-key", LocalImport(usdAmount: 9.25m))).EnsureSuccessStatusCode();
        var aliceJson = await ReadJson(await alice.GetAsync(ReadPath));
        var bobJson = await ReadJson(await bob.GetAsync(ReadPath));
        Assert.Equal("25.50", FindImportedAmount(aliceJson));
        Assert.Equal("9.25", FindImportedAmount(bobJson));
    }

    [Fact]
    public async Task ExactRetryReturnsPreviousResultAndConflictingRequestsDoNotOverwriteIt()
    {
        await using var factory = new ApiFactory();
        using var client = SignedInClient(factory, "alice");
        var first = await ReadJson(await Import(client, "retry-key", LocalImport()));
        var retry = await ReadJson(await Import(client, "retry-key", LocalImport()));
        Assert.True(JsonElement.DeepEquals(first, retry));
        Assert.Equal(HttpStatusCode.Conflict,
            (await Import(client, "retry-key", LocalImport(usdAmount: 3m))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await Import(client, "second-import", LocalImport())).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await Import(client, "wrong-revision", new { expectedRevision = "1", snapshot = LegacySnapshot() })).StatusCode);
        var current = await ReadJson(await client.GetAsync(ReadPath));
        Assert.True(JsonElement.DeepEquals(first, current));
    }

    [Fact]
    public async Task RejectsInvalidReferencesAndMoneyWithoutLeavingPartialData()
    {
        await using var factory = new ApiFactory();
        using var client = SignedInClient(factory, "alice");
        var invalidSnapshots = new[] {
            LegacySnapshot(pocketReference: "missing-pocket"),
            LegacySnapshot(pocketCurrency: "USD"),
            LegacySnapshot(usdAmount: 1.001m),
        };
        for (var index = 0; index < invalidSnapshots.Length; index++)
        {
            Assert.Equal(HttpStatusCode.BadRequest,
                (await Import(client, "invalid-" + index, new { expectedRevision = "0", snapshot = invalidSnapshots[index] })).StatusCode);
            await AssertEmpty(client);
        }
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(ImportPath, LocalImport())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await Import(client, "missing-snapshot", new { expectedRevision = "0" })).StatusCode);
        await AssertEmpty(client);
        (await Import(client, "valid-after-failures", LocalImport())).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task ImportsServerHistoryOnlyAtItsCurrentRevisionAndBlocksLegacyAccessAfterward()
    {
        await using var factory = new ApiFactory();
        using var client = SignedInClient(factory, "alice");
        var snapshot = new FinancialSnapshot(1,
            [new Movement("server-movement", "USD", 42.12m, "ingreso", "salario", "2026-11-01T12:00:00Z", null, null)], []);
        (await client.PutAsJsonAsync("/api/finances", new SaveFinanceRequest(0, snapshot))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict,
            (await Import(client, "stale-legacy", new { expectedRevision = "0", legacyRevision = "0" })).StatusCode);
        await AssertEmpty(client);
        var preservedLegacy = await client.GetFromJsonAsync<FinanceResponse>("/api/finances");
        Assert.Equal(1, preservedLegacy!.Revision);
        Assert.Equal(42.12m, Assert.Single(preservedLegacy.Snapshot.Transactions).Amount);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
        var originalDocument = await db.Documents.AsNoTracking().SingleAsync();

        var importBody = new { expectedRevision = "0", legacyRevision = "1" };
        var imported = await ReadJson(await Import(client, "server-import", importBody));
        var movement = Assert.Single(imported.GetProperty("snapshot").GetProperty("transactions").EnumerateArray());
        Assert.Equal("server-movement", movement.GetProperty("id").GetString());
        Assert.Equal("42.12", movement.GetProperty("amount").GetString());
        Assert.Equal("1", imported.GetProperty("revision").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.GetAsync("/api/finances")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PutAsJsonAsync("/api/finances", new SaveFinanceRequest(1, snapshot))).StatusCode);
        var retry = await ReadJson(await Import(client, "server-import", importBody));
        Assert.True(JsonElement.DeepEquals(imported, retry));
        var archivedDocument = await db.Documents.AsNoTracking().SingleAsync();
        Assert.Equal(originalDocument.OwnerId, archivedDocument.OwnerId);
        Assert.Equal(originalDocument.Revision, archivedDocument.Revision);
        Assert.Equal(originalDocument.Json, archivedDocument.Json);
    }

    [Fact]
    public async Task MigrationGuardSurvivesRestartWithV2DisabledWithoutBlockingOtherOwners()
    {
        var temporaryDirectory = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar);
        var databasePath = Path.GetFullPath(Path.Combine(temporaryDirectory, $"financia-restart-test-{Guid.NewGuid():N}.db"));
        Assert.Equal(temporaryDirectory, Path.GetDirectoryName(databasePath));
        try
        {
            await using (var firstFactory = new ApiFactory(databasePath: databasePath, deleteDatabaseOnDispose: false))
            {
                using var alice = SignedInClient(firstFactory, "alice");
                (await Import(alice, "import-before-restart", LocalImport())).EnsureSuccessStatusCode();
            }

            await using (var secondFactory = new ApiFactory(financeV2Enabled: false, databasePath: databasePath))
            {
                using var alice = SignedInClient(secondFactory, "alice");
                Assert.Equal(HttpStatusCode.NotFound, (await alice.GetAsync(ReadPath)).StatusCode);
                Assert.Equal(HttpStatusCode.Conflict, (await alice.GetAsync("/api/finances")).StatusCode);
                var legacyWrite = new SaveFinanceRequest(0, new FinancialSnapshot(1,
                    [new Movement("legacy-after-restart", "DOP", 10m, "ingreso", "salario", "2026-11-01T12:00:00Z", null, null)], []));
                Assert.Equal(HttpStatusCode.Conflict, (await alice.PutAsJsonAsync("/api/finances", legacyWrite)).StatusCode);

                using var bob = SignedInClient(secondFactory, "bob");
                var initialBob = await bob.GetFromJsonAsync<FinanceResponse>("/api/finances");
                Assert.Equal(0, initialBob!.Revision);
                (await bob.PutAsJsonAsync("/api/finances", legacyWrite)).EnsureSuccessStatusCode();
                var savedBob = await bob.GetFromJsonAsync<FinanceResponse>("/api/finances");
                Assert.Equal(1, savedBob!.Revision);
                Assert.Equal("legacy-after-restart", Assert.Single(savedBob.Snapshot.Transactions).Id);
            }
        }
        finally
        {
            // Exact random file in the verified temporary directory; also cleans up failed first starts.
            File.Delete(databasePath);
        }
    }

    private static HttpClient SignedInClient(ApiFactory factory, string owner)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", owner);
        return client;
    }

    private static async Task<HttpResponseMessage> Import(HttpClient client, string key, object body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, ImportPath) { Content = JsonContent.Create(body) };
        request.Headers.Add("Idempotency-Key", key);
        return await client.SendAsync(request);
    }

    private static async Task<JsonElement> ReadJson(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.Clone();
    }

    private static async Task AssertEmpty(HttpClient client)
    {
        var data = await ReadJson(await client.GetAsync(ReadPath));
        Assert.Equal("0", data.GetProperty("revision").GetString());
        var snapshot = data.GetProperty("snapshot");
        Assert.Equal(2, snapshot.GetProperty("version").GetInt32());
        Assert.Empty(snapshot.GetProperty("transactions").EnumerateArray());
        Assert.Empty(snapshot.GetProperty("pockets").EnumerateArray());
    }

    private static string? FindImportedAmount(JsonElement data) => data.GetProperty("snapshot").GetProperty("transactions")
        .EnumerateArray().Single(x => x.GetProperty("id").GetString() == "gmail:bank:message-1").GetProperty("amount").GetString();

    private static object LocalImport(decimal usdAmount = 25.50m) => new { expectedRevision = "0", snapshot = LegacySnapshot(usdAmount) };

    private static object LegacySnapshot(decimal usdAmount = 25.50m, string pocketReference = "pocket-local-1", string pocketCurrency = "DOP") => new {
        version = 1,
        transactions = new object[] {
            new { id = "income-local-1", currency = "DOP", amount = 1500.25m, type = "ingreso", category = "salario", date = "2026-11-01T12:00:00Z" },
            new { id = "gmail:bank:message-1", currency = "USD", amount = usdAmount, type = "ingreso", category = "otros", date = "2026-11-02T12:00:00Z" },
            new { id = "transfer-local-1", currency = "DOP", amount = 25m, type = "gasto", category = "ahorro", date = "2026-11-03T12:00:00Z", pocketId = pocketReference, note = "Reserva" },
        },
        pockets = new[] {
            new { id = "pocket-local-1", name = "Reserva", currency = pocketCurrency, targetAmount = 3000m,
                currentAmount = 175.50m, emoji = "🎯", color = "#123456", createdAt = "2026-10-01T12:00:00Z" },
        },
    };
}
