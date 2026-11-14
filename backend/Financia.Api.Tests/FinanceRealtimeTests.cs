using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Financia.Api.Persistence;
using Financia.Api.Realtime;
using Microsoft.AspNetCore.Connections;
using Microsoft.AspNetCore.Connections.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Financia.Api.Tests;

public class FinanceRealtimeTests
{
    private static readonly Guid Alice = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Bob = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task NegotiationRequiresAuthentication()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        const string negotiate = "/hubs/finances/negotiate?negotiateVersion=1";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync(negotiate, null)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "alice");
        (await client.PostAsync(negotiate, null)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task WebSocketProtocolDeliversCommittedMovementOnlyToItsAuthenticatedOwner()
    {
        await using var factory = new ApiFactory();
        using var aliceHttp = factory.CreateClient();
        using var bobHttp = factory.CreateClient();
        aliceHttp.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "alice");
        bobHttp.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "bob");
        var emptyImport = new { expectedRevision = "0", snapshot = new { version = 1, transactions = Array.Empty<object>(), pockets = Array.Empty<object>() } };
        await Post(aliceHttp, "/api/v2/imports/legacy", "initialize-alice", emptyImport);
        await Post(bobHttp, "/api/v2/imports/legacy", "initialize-bob", emptyImport);
        Assert.Equal(2, await PublishReal(factory));

        using var aliceSocket = await Connect(factory, "alice");
        using var bobSocket = await Connect(factory, "bob");
        await Post(aliceHttp, "/api/v2/movements", "alice-movement", new {
            id = "alice-movement", currency = "DOP", amount = "15.50", type = "ingreso", category = "salario", date = "2026-11-13T12:00:00Z",
        });
        Assert.Equal(1, await PublishReal(factory));
        AssertNotification(await ReceiveJson(aliceSocket), await EventId(factory, Alice, 2), "2");

        await Post(bobHttp, "/api/v2/movements", "bob-movement", new {
            id = "bob-movement", currency = "USD", amount = "20.00", type = "ingreso", category = "salario", date = "2026-11-13T12:00:00Z",
        });
        Assert.Equal(1, await PublishReal(factory));
        // If Alice's notification leaked, it would be Bob's first queued message and this assertion would fail.
        AssertNotification(await ReceiveJson(bobSocket), await EventId(factory, Bob, 2), "2");
    }

    [Fact]
    public void ConnectionOwnerComesOnlyFromAuthenticatedNameIdentifier()
    {
        var provider = new FinanceUserIdProvider();
        Assert.Equal(Alice.ToString("D"), provider.GetUserId(Connection(Alice.ToString("D"), authenticated: true)));
        Assert.Equal(Bob.ToString("D"), provider.GetUserId(Connection(Bob.ToString("D"), authenticated: true)));
        Assert.Null(provider.GetUserId(Connection(Alice.ToString("D"), authenticated: false)));
        Assert.Null(provider.GetUserId(Connection("invalid-owner", authenticated: true)));
    }

    [Fact]
    public async Task PublishesOnlyToEachOwnerAndDoesNotPublishAlreadyDeliveredEvents()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var first = NewEvent(Alice, 12);
        var second = NewEvent(Bob, 21);
        await Seed(factory, first, second);
        var hub = new RecordingHub();

        Assert.Equal(2, await Publish(factory, hub));
        Assert.Equal(0, await Publish(factory, hub));
        Assert.Equal(2, hub.Sent.Count);
        Assert.Contains(hub.Sent, sent => sent.Owner == Alice.ToString("D") && sent.Payload.EventId == first.EventId.ToString("D") && sent.Payload.Revision == "12");
        Assert.Contains(hub.Sent, sent => sent.Owner == Bob.ToString("D") && sent.Payload.EventId == second.EventId.ToString("D") && sent.Payload.Revision == "21");
        Assert.All(hub.Sent, sent => Assert.Equal("FinanceChanged", sent.Method));
    }

    [Fact]
    public async Task FailedDeliveryRemainsPendingAndCanBeRetried()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var item = NewEvent(Alice, 7);
        await Seed(factory, item);
        var hub = new RecordingHub { FailNext = true };
        await Assert.ThrowsAsync<IOException>(() => Publish(factory, hub));
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>();
            Assert.Null((await db.Set<FinanceOutbox>().SingleAsync()).PublishedAt);
        }
        Assert.Equal(1, await Publish(factory, hub));
        Assert.Equal(item.EventId.ToString("D"), Assert.Single(hub.Sent).Payload.EventId);
    }

    [Fact]
    public async Task RolledBackEventIsNeverPublished()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>();
            await using var transaction = await db.Database.BeginTransactionAsync();
            db.Accounts.Add(new FinanceAccount { UserId = Alice, Revision = 1, ImportKey = "test", ImportHash = "test" });
            db.Set<FinanceOutbox>().Add(NewEvent(Alice, 1));
            await db.SaveChangesAsync();
            await transaction.RollbackAsync();
        }
        var hub = new RecordingHub();
        Assert.Equal(0, await Publish(factory, hub));
        Assert.Empty(hub.Sent);
    }

    [Fact]
    public async Task UncertainDeliveryRetriesWithTheSameEventId()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var item = NewEvent(Alice, 2);
        await Seed(factory, item);
        var hub = new RecordingHub { FailAfterNext = true };
        await Assert.ThrowsAsync<IOException>(() => Publish(factory, hub));
        Assert.Equal(1, await Publish(factory, hub));
        Assert.Equal(2, hub.Sent.Count);
        Assert.All(hub.Sent, sent => Assert.Equal(item.EventId.ToString("D"), sent.Payload.EventId));
    }

    [Fact]
    public async Task EachBatchPublishesAtMostOneHundredEvents()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        await Seed(factory, Enumerable.Range(1, 101).Select(revision => NewEvent(Alice, revision)).ToArray());
        var hub = new RecordingHub();
        Assert.Equal(100, await Publish(factory, hub));
        Assert.Equal(1, await Publish(factory, hub));
        Assert.Equal(101, hub.Sent.Select(sent => sent.Payload.EventId).Distinct().Count());
    }

    private static FinanceOutbox NewEvent(Guid owner, long revision) => new() {
        EventId = Guid.NewGuid(), UserId = owner, Revision = revision, CreatedAt = DateTime.UtcNow,
    };

    private static async Task Post(HttpClient client, string path, string key, object body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("Idempotency-Key", key);
        using var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
    }

    private static async Task<WebSocket> Connect(ApiFactory factory, string owner)
    {
        var client = factory.Server.CreateWebSocketClient();
        client.ConfigureRequest = request => request.Headers.Authorization = "Bearer " + owner;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var socket = await client.ConnectAsync(new Uri("ws://localhost/hubs/finances"), timeout.Token);
        try
        {
            var handshake = Encoding.UTF8.GetBytes("{\"protocol\":\"json\",\"version\":1}\u001e");
            await socket.SendAsync(new ArraySegment<byte>(handshake), WebSocketMessageType.Text, true, timeout.Token);
            var response = await ReceiveJson(socket);
            Assert.Equal(JsonValueKind.Object, response.ValueKind);
            Assert.Empty(response.EnumerateObject());
            return socket;
        }
        catch { socket.Dispose(); throw; }
    }

    private static async Task<JsonElement> ReceiveJson(WebSocket socket)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        using var message = new MemoryStream();
        var buffer = new byte[4096];
        WebSocketReceiveResult frame;
        do
        {
            frame = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), timeout.Token);
            Assert.Equal(WebSocketMessageType.Text, frame.MessageType);
            message.Write(buffer, 0, frame.Count);
        } while (!frame.EndOfMessage);
        var records = Encoding.UTF8.GetString(message.ToArray()).Split('\u001e', StringSplitOptions.RemoveEmptyEntries);
        using var json = JsonDocument.Parse(Assert.Single(records));
        return json.RootElement.Clone();
    }

    private static void AssertNotification(JsonElement message, string eventId, string revision)
    {
        Assert.Equal(1, message.GetProperty("type").GetInt32());
        Assert.Equal("FinanceChanged", message.GetProperty("target").GetString());
        var payload = Assert.Single(message.GetProperty("arguments").EnumerateArray());
        Assert.Equal(eventId, payload.GetProperty("eventId").GetString());
        Assert.Equal(revision, payload.GetProperty("revision").GetString());
    }

    private static async Task<int> PublishReal(ApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<FinanceOutboxPublisher>().PublishPendingAsync(CancellationToken.None);
    }

    private static async Task<string> EventId(ApiFactory factory, Guid owner, long revision)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>();
        var item = await db.Outbox.SingleAsync(item => item.UserId == owner && item.Revision == revision);
        return item.EventId.ToString("D");
    }

    private static async Task Seed(ApiFactory factory, params FinanceOutbox[] events)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>();
        db.Accounts.AddRange(events.Select(item => item.UserId).Distinct().Select(owner => new FinanceAccount {
            UserId = owner, Revision = events.Where(item => item.UserId == owner).Max(item => item.Revision),
            ImportKey = "test", ImportHash = "test",
        }));
        db.Set<FinanceOutbox>().AddRange(events);
        await db.SaveChangesAsync();
    }

    private static async Task<int> Publish(ApiFactory factory, RecordingHub hub)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>();
        return await new FinanceOutboxPublisher(db, hub).PublishPendingAsync(CancellationToken.None);
    }

    private static HubConnectionContext Connection(string owner, bool authenticated)
    {
        var connection = new DefaultConnectionContext();
        connection.Features.Set<IConnectionUserFeature>(new ConnectionUser {
            User = new ClaimsPrincipal(new ClaimsIdentity([
                new Claim(ClaimTypes.NameIdentifier, owner), new Claim("userId", Bob.ToString("D")),
            ], authenticated ? "Test" : null)),
        });
        return new HubConnectionContext(connection, new HubConnectionContextOptions(), NullLoggerFactory.Instance);
    }

    private sealed class ConnectionUser : IConnectionUserFeature
    {
        public ClaimsPrincipal? User { get; set; }
    }

    private sealed record SentMessage(string Owner, string Method, FinanceChanged Payload);

    private sealed class RecordingHub : IHubContext<FinanceHub>, IHubClients
    {
        public List<SentMessage> Sent { get; } = [];
        public bool FailNext { get; set; }
        public bool FailAfterNext { get; set; }
        public IHubClients Clients => this;
        public IGroupManager Groups => throw new NotSupportedException();
        public IClientProxy User(string userId) => new UserProxy(this, userId);
        public IClientProxy All => throw new NotSupportedException("Financial notifications must never broadcast to all users.");
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => throw new NotSupportedException();
        public IClientProxy Client(string connectionId) => throw new NotSupportedException();
        IClientProxy IHubClients<IClientProxy>.Clients(IReadOnlyList<string> connectionIds) => throw new NotSupportedException();
        public IClientProxy Group(string groupName) => throw new NotSupportedException();
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => throw new NotSupportedException();
        IClientProxy IHubClients<IClientProxy>.Groups(IReadOnlyList<string> groupNames) => throw new NotSupportedException();
        public IClientProxy Users(IReadOnlyList<string> userIds) => throw new NotSupportedException();

        private sealed class UserProxy(RecordingHub hub, string owner) : IClientProxy
        {
            public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (hub.FailNext)
                {
                    hub.FailNext = false;
                    throw new IOException("Simulated delivery failure.");
                }
                hub.Sent.Add(new SentMessage(owner, method, Assert.IsType<FinanceChanged>(Assert.Single(args))));
                if (hub.FailAfterNext)
                {
                    hub.FailAfterNext = false;
                    throw new IOException("Simulated uncertain delivery.");
                }
                return Task.CompletedTask;
            }
        }
    }
}
