using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Financia.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace Financia.Api.Tests;

public class FinanceApiTests
{
    [Fact]
    public async Task OptionalMovementFieldsMatchTheMobileContract()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "alice");
        var saved = await client.PutAsJsonAsync("/api/finances", new SaveFinanceRequest(0, Snapshot(10m)));
        saved.EnsureSuccessStatusCode();
        foreach (var response in new[] { saved, await client.GetAsync("/api/finances") })
        {
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var movement = json.RootElement.GetProperty("snapshot").GetProperty("transactions")[0];
            Assert.False(movement.TryGetProperty("note", out _));
            Assert.False(movement.TryGetProperty("pocketId", out _));
        }
        var snapshot = Snapshot(10m);
        snapshot = snapshot with { Transactions = [snapshot.Transactions[0] with { Note = "Nota", PocketId = "p1" }] };
        (await client.PutAsJsonAsync("/api/finances", new SaveFinanceRequest(1, snapshot))).EnsureSuccessStatusCode();
        var loaded = await client.GetFromJsonAsync<FinanceResponse>("/api/finances");
        Assert.Equal("Nota", loaded!.Snapshot.Transactions[0].Note);
        Assert.Equal("p1", loaded.Snapshot.Transactions[0].PocketId);
    }

    [Fact]
    public async Task RequiresAuthenticationAndSeparatesOwners()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/finances")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "alice");
        var initial = await client.GetFromJsonAsync<FinanceResponse>("/api/finances");
        Assert.Equal(0, initial!.Revision);
        var snapshot = Snapshot(12.34m);
        var saved = await client.PutAsJsonAsync("/api/finances", new SaveFinanceRequest(0, snapshot));
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal(12.34m, (await client.GetFromJsonAsync<FinanceResponse>("/api/finances"))!.Snapshot.Transactions[0].Amount);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "bob");
        Assert.Empty((await client.GetFromJsonAsync<FinanceResponse>("/api/finances"))!.Snapshot.Transactions);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "alice");
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync("/api/finances", new SaveFinanceRequest(0, snapshot))).StatusCode);
        Assert.Equal(1, (await client.GetFromJsonAsync<FinanceResponse>("/api/finances"))!.Revision);
    }

    [Fact]
    public async Task RejectsInvalidMoneyAndDuplicateIdsWithoutChangingHistory()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "alice");
        foreach (var amount in new[] { -1m, 0m, 1.001m, 1000000000000m })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/finances", new SaveFinanceRequest(0, Snapshot(amount)))).StatusCode);
        var snapshot = Snapshot(10m);
        snapshot = snapshot with { Transactions = [snapshot.Transactions[0], snapshot.Transactions[0]] };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/finances", new SaveFinanceRequest(0, snapshot))).StatusCode);
        Assert.Equal(0, (await client.GetFromJsonAsync<FinanceResponse>("/api/finances"))!.Revision);
    }

    private static FinancialSnapshot Snapshot(decimal amount) => new(1,
        [new Movement("m1", "DOP", amount, "ingreso", "salario", "2026-11-01T12:00:00Z", null, null)], []);
}

sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string database = Path.Combine(Path.GetTempPath(), $"financia-test-{Guid.NewGuid()}.db");
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> {
            ["ConnectionStrings:Sqlite"] = $"Data Source={database};Pooling=False", ["ConnectionStrings:Postgres"] = ""
        }));
        builder.ConfigureTestServices(services => services.AddAuthentication("Test")
            .AddScheme<AuthenticationSchemeOptions, TestAuthentication>("Test", _ => { }));
    }
    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        File.Delete(database);
    }
}

sealed class TestAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var owner = Request.Headers.Authorization.ToString() switch {
            "Bearer alice" => "11111111-1111-1111-1111-111111111111",
            "Bearer bob" => "22222222-2222-2222-2222-222222222222",
            _ => null
        };
        if (owner is null) return Task.FromResult(AuthenticateResult.NoResult());
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, owner)], Scheme.Name));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name)));
    }
}
