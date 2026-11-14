using System.Globalization;
using Financia.Api.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Realtime;

public sealed class FinanceOutboxPublisher(NormalizedFinanceDb db, IHubContext<FinanceHub> hub)
{
    public async Task<int> PublishPendingAsync(CancellationToken cancellationToken)
    {
        // A fresh scope reads committed events. Publishing before marking can duplicate delivery after a crash;
        // marking first could lose the event. Clients must deduplicate EventId and refresh authoritative data.
        var pending = await db.Set<FinanceOutbox>().Where(item => item.PublishedAt == null)
            .OrderBy(item => item.CreatedAt).ThenBy(item => item.EventId)
            .Take(100).ToArrayAsync(cancellationToken);
        var published = 0;
        foreach (var item in pending)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await hub.Clients.User(item.UserId.ToString("D")).SendAsync("FinanceChanged",
                new FinanceChanged(item.EventId.ToString("D"), item.Revision.ToString(CultureInfo.InvariantCulture)), cancellationToken);
            item.PublishedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            published++;
        }
        return published;
    }
}
