using System.Net;
using System.Net.Http.Headers;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Financia.Api.Tests;

public sealed class SessionAuthenticationTests
{
    [Fact]
    public async Task QueryTokensAreAcceptedOnlyForHubTransportAndStillValidatedOnline()
    {
        await using var factory = new IdentityFactory();
        using var client = factory.CreateClient();
        var token = Token(DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeSeconds());
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/finances?access_token={token}")).StatusCode);
        Assert.Equal(0, factory.Identity.Calls);
        // A plain GET cannot start a transport, but auth must succeed before SignalR rejects the missing connection.
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/hubs/finances?access_token={token}")).StatusCode);
        Assert.Equal(1, factory.Identity.Calls);
        Assert.Equal(token, factory.Identity.LastToken);
    }

    [Fact]
    public async Task TokenPayloadCannotOverrideIdentityServiceRejectionOrExpiry()
    {
        await using var factory = new IdentityFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(DateTimeOffset.UtcNow.AddMinutes(-10).ToUnixTimeSeconds()));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/finances")).StatusCode);
        factory.Identity.Reject = true;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeSeconds()));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/finances")).StatusCode);
        Assert.Equal(2, factory.Identity.Calls);
    }

    [Fact]
    public async Task UnlistedBrowserOriginCannotUseTheHub()
    {
        await using var factory = new IdentityFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "https://unlisted.example");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeSeconds()));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/hubs/finances")).StatusCode);
        Assert.Equal(0, factory.Identity.Calls);
    }

    [Fact]
    public async Task OpenWebSocketClosesWhenItsValidatedTokenExpires()
    {
        await using var factory = new IdentityFactory();
        using var client = factory.CreateClient();
        var expiry = DateTimeOffset.UtcNow.AddSeconds(3).ToUnixTimeSeconds();
        var sockets = factory.Server.CreateWebSocketClient();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using var socket = await sockets.ConnectAsync(new Uri($"ws://localhost/hubs/finances?access_token={Token(expiry)}"), timeout.Token);
        var handshake = Encoding.UTF8.GetBytes("{\"protocol\":\"json\",\"version\":1}\u001e");
        await socket.SendAsync(new ArraySegment<byte>(handshake), WebSocketMessageType.Text, true, timeout.Token);
        var buffer = new byte[4096];
        var first = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), timeout.Token);
        Assert.Equal("{}\u001e", Encoding.UTF8.GetString(buffer, 0, first.Count));
        // SignalR may send a protocol close message before the WebSocket close frame.
        var closed = false;
        while (!closed)
        {
            var frame = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), timeout.Token);
            if (frame.MessageType == WebSocketMessageType.Close) closed = true;
            else
            {
                foreach (var record in Encoding.UTF8.GetString(buffer, 0, frame.Count).Split('\u001e', StringSplitOptions.RemoveEmptyEntries))
                {
                    using var message = JsonDocument.Parse(record);
                    if (message.RootElement.TryGetProperty("type", out var type) && type.GetInt32() == 7) closed = true;
                }
            }
        }
        Assert.True(DateTimeOffset.UtcNow.ToUnixTimeSeconds() >= expiry);
        Assert.Equal(1, factory.Identity.Calls);
    }

    private static string Token(long expiry)
    {
        var payload = Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(new { exp = expiry }))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        // No real signature or identity: only the fake HTTP identity provider accepts this token in tests.
        return $"e30.{payload}.test";
    }

    private sealed class IdentityFactory : WebApplicationFactory<Program>
    {
        private readonly string database = Path.Combine(Path.GetTempPath(), $"financia-identity-{Guid.NewGuid():N}.db");
        public FakeIdentity Identity { get; } = new();
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureLogging(logging => logging.ClearProviders().AddConsole());
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> {
                ["ConnectionStrings:Sqlite"] = $"Data Source={database};Pooling=False",
                ["ConnectionStrings:Postgres"] = "", ["FinanceV2:Enabled"] = "true",
                ["Authentication:SupabaseUrl"] = "https://identity.example", ["Authentication:PublishableKey"] = "test-public-key"
            }));
            builder.ConfigureTestServices(services => services.AddHttpClient("identity").ConfigurePrimaryHttpMessageHandler(() => Identity));
        }
        public override async ValueTask DisposeAsync()
        {
            await base.DisposeAsync();
            File.Delete(database);
        }
    }

    private sealed class FakeIdentity : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public string? LastToken { get; private set; }
        public bool Reject { get; set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            Assert.Equal("https://identity.example/auth/v1/user", request.RequestUri!.AbsoluteUri);
            LastToken = request.Headers.Authorization?.Parameter;
            return Task.FromResult(new HttpResponseMessage(Reject ? HttpStatusCode.Unauthorized : HttpStatusCode.OK) {
                Content = new StringContent("{\"id\":\"11111111-1111-1111-1111-111111111111\"}", Encoding.UTF8, "application/json")
            });
        }
    }
}
