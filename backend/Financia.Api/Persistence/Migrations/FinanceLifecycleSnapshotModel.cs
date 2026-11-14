using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Persistence.Migrations;

// Frozen migration metadata; no runtime CLR types or model configuration are consulted.
internal static class FinanceLifecycleSnapshotModel
{
    internal static void Configure(ModelBuilder builder)
    {
        MovementCommandsSnapshotModel.Configure(builder);
        builder.Entity("Financia.Api.Persistence.NormalizedMovement").Property<DateTime?>("DeletedAt")
            .HasColumnName("deleted_at").IsRequired(false);
        builder.Entity("Financia.Api.Persistence.NormalizedPocket").Property<DateTime?>("ClosedAt")
            .HasColumnName("closed_at").IsRequired(false);
    }
}
