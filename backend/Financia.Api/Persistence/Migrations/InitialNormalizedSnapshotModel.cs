using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Persistence.Migrations;

// Historical snapshot uses string entity names and explicit properties so runtime CLR changes cannot silently alter migration history.
internal static class InitialNormalizedSnapshotModel
{
    internal static void Configure(ModelBuilder builder)
    {
        builder.Entity("Financia.Api.FinanceDocument", entity =>
        {
            entity.ToTable("Documents", table => table.ExcludeFromMigrations());
            entity.Property<Guid>("OwnerId").ValueGeneratedNever();
            entity.Property<long>("Revision").IsConcurrencyToken();
            entity.Property<string>("Json").IsRequired();
            entity.HasKey("OwnerId");
        });
        builder.Entity("Financia.Api.Persistence.FinanceAccount", entity =>
        {
            entity.ToTable("finance_accounts", "financia", table =>
            {
                table.HasCheckConstraint("ck_accounts_revision", "revision >= 0");
                table.HasCheckConstraint("ck_accounts_legacy_revision", "legacy_revision IS NULL OR legacy_revision >= 0");
            });
            entity.Property<Guid>("UserId").HasColumnName("user_id").ValueGeneratedNever();
            entity.Property<long>("Revision").HasColumnName("revision").IsConcurrencyToken();
            entity.Property<string>("ImportKey").HasColumnName("import_key").HasMaxLength(256).IsRequired();
            entity.Property<string>("ImportHash").HasColumnName("import_hash").HasMaxLength(64).IsRequired();
            entity.Property<long?>("LegacyRevision").HasColumnName("legacy_revision").IsRequired(false);
            entity.HasKey("UserId");
        });
        builder.Entity("Financia.Api.Persistence.NormalizedPocket", entity =>
        {
            entity.ToTable("pockets", "financia", table =>
            {
                table.HasCheckConstraint("ck_pockets_currency", "currency IN ('DOP', 'USD')");
                table.HasCheckConstraint("ck_pockets_target", "CAST(target_amount AS NUMERIC) > 0 AND CAST(target_amount AS NUMERIC) <= 999999999999.99");
                table.HasCheckConstraint("ck_pockets_balance", "CAST(current_amount AS NUMERIC) >= 0 AND CAST(current_amount AS NUMERIC) <= 999999999999.99");
                table.HasCheckConstraint("ck_pockets_version", "version > 0");
            });
            entity.Property<Guid>("UserId").HasColumnName("user_id").ValueGeneratedNever();
            entity.Property<string>("Id").HasColumnName("id").HasMaxLength(256).IsRequired().ValueGeneratedNever();
            entity.Property<string>("Name").HasColumnName("name").HasMaxLength(200).IsRequired();
            entity.Property<string>("Currency").HasColumnName("currency").HasMaxLength(3).IsRequired();
            entity.Property<decimal>("TargetAmount").HasColumnName("target_amount").HasPrecision(14, 2);
            entity.Property<decimal>("CurrentAmount").HasColumnName("current_amount").HasPrecision(14, 2);
            entity.Property<string>("Emoji").HasColumnName("emoji").HasMaxLength(64).IsRequired();
            entity.Property<string>("Color").HasColumnName("color").HasMaxLength(64).IsRequired(false);
            entity.Property<DateTime>("CreatedAt").HasColumnName("created_at");
            entity.Property<long>("Version").HasColumnName("version").IsConcurrencyToken();
            entity.HasKey("UserId", "Id");
            entity.HasOne("Financia.Api.Persistence.FinanceAccount", null).WithMany().HasForeignKey("UserId").OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity("Financia.Api.Persistence.NormalizedMovement", entity =>
        {
            entity.ToTable("movements", "financia", table =>
            {
                table.HasCheckConstraint("ck_movements_currency", "currency IN ('DOP', 'USD')");
                table.HasCheckConstraint("ck_movements_amount", "CAST(amount AS NUMERIC) > 0 AND CAST(amount AS NUMERIC) <= 999999999999.99");
                table.HasCheckConstraint("ck_movements_type", "type IN ('ingreso', 'gasto')");
                table.HasCheckConstraint("ck_movements_category", "category IN ('comida', 'transporte', 'entretenimiento', 'servicios', 'salud', 'educacion', 'salario', 'ahorro', 'otros')");
                table.HasCheckConstraint("ck_movements_version", "version > 0");
            });
            entity.Property<Guid>("UserId").HasColumnName("user_id").ValueGeneratedNever();
            entity.Property<string>("Id").HasColumnName("id").HasMaxLength(256).IsRequired().ValueGeneratedNever();
            entity.Property<string>("Currency").HasColumnName("currency").HasMaxLength(3).IsRequired();
            entity.Property<decimal>("Amount").HasColumnName("amount").HasPrecision(14, 2);
            entity.Property<string>("Type").HasColumnName("type").HasMaxLength(7).IsRequired();
            entity.Property<string>("Category").HasColumnName("category").HasMaxLength(32).IsRequired();
            entity.Property<DateTime>("OccurredAt").HasColumnName("occurred_at");
            entity.Property<string>("Note").HasColumnName("note").HasMaxLength(4000).IsRequired(false);
            entity.Property<string>("PocketId").HasColumnName("pocket_id").HasMaxLength(256).IsRequired(false);
            entity.Property<long>("Version").HasColumnName("version").IsConcurrencyToken();
            entity.HasKey("UserId", "Id");
            entity.HasOne("Financia.Api.Persistence.FinanceAccount", null).WithMany().HasForeignKey("UserId").OnDelete(DeleteBehavior.Restrict);
            entity.HasOne("Financia.Api.Persistence.NormalizedPocket", null).WithMany().HasForeignKey("UserId", "PocketId")
                .HasPrincipalKey("UserId", "Id").OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex("UserId", "PocketId");
            entity.HasIndex("UserId", "OccurredAt", "Id");
        });
    }
}
