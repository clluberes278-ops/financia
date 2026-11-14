using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Persistence.Migrations;

// Historical schema: string-named entities deliberately do not discover runtime CLR properties.
internal static class MovementCommandsSnapshotModel
{
    internal static void Configure(ModelBuilder builder)
    {
        InitialNormalizedSnapshotModel.Configure(builder);
        builder.Entity("Financia.Api.Persistence.FinanceAccount").Property<string>("ImportResponseJson")
            .HasColumnName("import_response_json").IsRequired(false);
        builder.Entity("Financia.Api.Persistence.CommandReceipt", entity =>
        {
            entity.ToTable("command_receipts", "financia", table =>
                table.HasCheckConstraint("ck_command_receipts_status", "status_code >= 100 AND status_code <= 599"));
            entity.Property<Guid>("UserId").HasColumnName("user_id").ValueGeneratedNever();
            entity.Property<string>("Key").HasColumnName("key").HasMaxLength(128).IsRequired().ValueGeneratedNever();
            entity.Property<string>("Operation").HasColumnName("operation").HasMaxLength(64).IsRequired();
            entity.Property<string>("RequestHash").HasColumnName("request_hash").HasMaxLength(64).IsRequired();
            entity.Property<string>("ResponseJson").HasColumnName("response_json").IsRequired();
            entity.Property<int>("StatusCode").HasColumnName("status_code");
            entity.Property<DateTime>("CreatedAt").HasColumnName("created_at");
            entity.HasKey("UserId", "Key");
            entity.HasOne("Financia.Api.Persistence.FinanceAccount", null).WithMany().HasForeignKey("UserId").OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity("Financia.Api.Persistence.FinanceOutbox", entity =>
        {
            entity.ToTable("finance_outbox", "financia", table =>
                table.HasCheckConstraint("ck_finance_outbox_revision", "revision > 0"));
            entity.Property<Guid>("EventId").HasColumnName("event_id").ValueGeneratedNever();
            entity.Property<Guid>("UserId").HasColumnName("user_id").ValueGeneratedNever();
            entity.Property<long>("Revision").HasColumnName("revision");
            entity.Property<DateTime>("CreatedAt").HasColumnName("created_at");
            entity.Property<DateTime?>("PublishedAt").HasColumnName("published_at").IsRequired(false);
            entity.HasKey("EventId");
            entity.HasOne("Financia.Api.Persistence.FinanceAccount", null).WithMany().HasForeignKey("UserId").OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex("UserId", "Revision").IsUnique();
            entity.HasIndex("CreatedAt", "EventId")
                .HasDatabaseName("IX_finance_outbox_unpublished_created").HasFilter("published_at IS NULL");
        });
    }
}
