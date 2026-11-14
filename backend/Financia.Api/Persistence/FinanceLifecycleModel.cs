using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Persistence;

internal static class FinanceLifecycleModel
{
    internal static void Configure(ModelBuilder builder)
    {
        builder.Entity<NormalizedMovement>().Property(x => x.DeletedAt)
            .HasColumnName("deleted_at").IsRequired(false);
        builder.Entity<NormalizedPocket>().Property(x => x.ClosedAt)
            .HasColumnName("closed_at").IsRequired(false);
    }
}
