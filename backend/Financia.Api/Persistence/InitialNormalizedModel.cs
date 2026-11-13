using Microsoft.EntityFrameworkCore;

namespace Financia.Api.Persistence;

// Runtime model configuration; schema changes require a new EF migration.
// SQLite ignores schema metadata and creates these tables in its ordinary database.
internal static class InitialNormalizedModel
{
    internal static void Configure(ModelBuilder builder)
    {
        builder.Entity<FinanceDocument>(entity =>
        {
            entity.ToTable("Documents", table => table.ExcludeFromMigrations());
            entity.HasKey(x => x.OwnerId);
            entity.Property(x => x.OwnerId).ValueGeneratedNever();
            entity.Property(x => x.Revision).IsConcurrencyToken();
            entity.Property(x => x.Json).IsRequired();
        });
        builder.Entity<FinanceAccount>(entity =>
        {
            entity.ToTable("finance_accounts", NormalizedFinanceDb.Schema, table =>
            {
                table.HasCheckConstraint("ck_accounts_revision", "revision >= 0");
                table.HasCheckConstraint("ck_accounts_legacy_revision", "legacy_revision IS NULL OR legacy_revision >= 0");
            });
            entity.HasKey(x => x.UserId);
            entity.Property(x => x.UserId).HasColumnName("user_id").ValueGeneratedNever();
            entity.Property(x => x.Revision).HasColumnName("revision").IsConcurrencyToken();
            entity.Property(x => x.ImportKey).HasColumnName("import_key").HasMaxLength(256).IsRequired();
            entity.Property(x => x.ImportHash).HasColumnName("import_hash").HasMaxLength(64).IsRequired();
            entity.Property(x => x.LegacyRevision).HasColumnName("legacy_revision").IsRequired(false);
        });
        builder.Entity<NormalizedPocket>(entity =>
        {
            entity.ToTable("pockets", NormalizedFinanceDb.Schema, table =>
            {
                table.HasCheckConstraint("ck_pockets_currency", "currency IN ('DOP', 'USD')");
                table.HasCheckConstraint("ck_pockets_target", "CAST(target_amount AS NUMERIC) > 0 AND CAST(target_amount AS NUMERIC) <= 999999999999.99");
                table.HasCheckConstraint("ck_pockets_balance", "CAST(current_amount AS NUMERIC) >= 0 AND CAST(current_amount AS NUMERIC) <= 999999999999.99");
                table.HasCheckConstraint("ck_pockets_version", "version > 0");
            });
            entity.HasKey(x => new { x.UserId, x.Id });
            entity.Property(x => x.UserId).HasColumnName("user_id").ValueGeneratedNever();
            entity.Property(x => x.Id).HasColumnName("id").HasMaxLength(256).IsRequired().ValueGeneratedNever();
            entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
            entity.Property(x => x.Currency).HasColumnName("currency").HasMaxLength(3).IsRequired();
            entity.Property(x => x.TargetAmount).HasColumnName("target_amount").HasPrecision(14, 2);
            entity.Property(x => x.CurrentAmount).HasColumnName("current_amount").HasPrecision(14, 2);
            entity.Property(x => x.Emoji).HasColumnName("emoji").HasMaxLength(64).IsRequired();
            entity.Property(x => x.Color).HasColumnName("color").HasMaxLength(64).IsRequired(false);
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.Version).HasColumnName("version").IsConcurrencyToken();
            entity.HasOne<FinanceAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<NormalizedMovement>(entity =>
        {
            entity.ToTable("movements", NormalizedFinanceDb.Schema, table =>
            {
                table.HasCheckConstraint("ck_movements_currency", "currency IN ('DOP', 'USD')");
                table.HasCheckConstraint("ck_movements_amount", "CAST(amount AS NUMERIC) > 0 AND CAST(amount AS NUMERIC) <= 999999999999.99");
                table.HasCheckConstraint("ck_movements_type", "type IN ('ingreso', 'gasto')");
                table.HasCheckConstraint("ck_movements_category", "category IN ('comida', 'transporte', 'entretenimiento', 'servicios', 'salud', 'educacion', 'salario', 'ahorro', 'otros')");
                table.HasCheckConstraint("ck_movements_version", "version > 0");
            });
            entity.HasKey(x => new { x.UserId, x.Id });
            entity.Property(x => x.UserId).HasColumnName("user_id").ValueGeneratedNever();
            entity.Property(x => x.Id).HasColumnName("id").HasMaxLength(256).IsRequired().ValueGeneratedNever();
            entity.Property(x => x.Currency).HasColumnName("currency").HasMaxLength(3).IsRequired();
            entity.Property(x => x.Amount).HasColumnName("amount").HasPrecision(14, 2);
            entity.Property(x => x.Type).HasColumnName("type").HasMaxLength(7).IsRequired();
            entity.Property(x => x.Category).HasColumnName("category").HasMaxLength(32).IsRequired();
            entity.Property(x => x.OccurredAt).HasColumnName("occurred_at");
            entity.Property(x => x.Note).HasColumnName("note").HasMaxLength(4000).IsRequired(false);
            entity.Property(x => x.PocketId).HasColumnName("pocket_id").HasMaxLength(256).IsRequired(false);
            entity.Property(x => x.Version).HasColumnName("version").IsConcurrencyToken();
            entity.HasOne<FinanceAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<NormalizedPocket>().WithMany().HasForeignKey(x => new { x.UserId, x.PocketId })
                .HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => new { x.UserId, x.PocketId });
            entity.HasIndex(x => new { x.UserId, x.OccurredAt, x.Id });
        });
    }
}
