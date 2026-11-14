using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Financia.Api.Realtime;

// Membership is derived exclusively from the authenticated identity. Clients cannot select another owner.
[Authorize]
public sealed class FinanceHub : Hub { }

public sealed class FinanceUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) =>
        connection.User?.Identity?.IsAuthenticated == true
        && Guid.TryParse(connection.User.FindFirstValue(ClaimTypes.NameIdentifier), out var owner)
            ? owner.ToString("D") : null;
}

public sealed record FinanceChanged(string EventId, string Revision);
