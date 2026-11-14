using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Persistence;

internal static class MovementCommandsModel
{
    internal static void Configure(ModelBuilder builder)
    {
        builder.Entity<FinanceAccount>().Property(x => x.ImportResponseJson)
            .HasColumnName("import_response_json").IsRequired(false);
        builder.Entity<CommandReceipt>(entity =>
        {
            entity.ToTable("command_receipts", NormalizedFinanceDb.Schema, table =>
                table.HasCheckConstraint("ck_command_receipts_status", "status_code >= 100 AND status_code <= 599"));
            entity.Property(x => x.UserId).HasColumnName("user_id").ValueGeneratedNever();
            entity.Property(x => x.Key).HasColumnName("key").HasMaxLength(128).IsRequired().ValueGeneratedNever();
            entity.Property(x => x.Operation).HasColumnName("operation").HasMaxLength(64).IsRequired();
            entity.Property(x => x.RequestHash).HasColumnName("request_hash").HasMaxLength(64).IsRequired();
            entity.Property(x => x.ResponseJson).HasColumnName("response_json").IsRequired();
            entity.Property(x => x.StatusCode).HasColumnName("status_code");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.HasKey(x => new { x.UserId, x.Key });
            entity.HasOne<FinanceAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<FinanceOutbox>(entity =>
        {
            entity.ToTable("finance_outbox", NormalizedFinanceDb.Schema, table =>
                table.HasCheckConstraint("ck_finance_outbox_revision", "revision > 0"));
            entity.Property(x => x.EventId).HasColumnName("event_id").ValueGeneratedNever();
            entity.Property(x => x.UserId).HasColumnName("user_id").ValueGeneratedNever();
            entity.Property(x => x.Revision).HasColumnName("revision");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.PublishedAt).HasColumnName("published_at").IsRequired(false);
            entity.HasKey(x => x.EventId);
            entity.HasOne<FinanceAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => new { x.UserId, x.Revision }).IsUnique();
            entity.HasIndex(x => new { x.CreatedAt, x.EventId })
                .HasDatabaseName("IX_finance_outbox_unpublished_created").HasFilter("published_at IS NULL");
        });
    }
}
