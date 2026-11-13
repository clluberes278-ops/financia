using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Financia.Api.Persistence.Migrations;

[DbContext(typeof(NormalizedFinanceDb))]
[Migration("20261113000100_InitialNormalized")]
public sealed class InitialNormalized : Migration
{
    private string? ProviderSchema => ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL" ? NormalizedFinanceDb.Schema : null;

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        var schema = ProviderSchema;
        if (schema is not null) migrationBuilder.EnsureSchema(schema);
        migrationBuilder.CreateTable("finance_accounts", schema: schema, columns: table => new
        {
            user_id = table.Column<Guid>(nullable: false),
            revision = table.Column<long>(nullable: false),
            import_key = table.Column<string>(maxLength: 256, nullable: false),
            import_hash = table.Column<string>(maxLength: 64, nullable: false),
            legacy_revision = table.Column<long>(nullable: true)
        }, constraints: table =>
        {
            table.PrimaryKey("PK_finance_accounts", x => x.user_id);
            table.CheckConstraint("ck_accounts_revision", "revision >= 0");
            table.CheckConstraint("ck_accounts_legacy_revision", "legacy_revision IS NULL OR legacy_revision >= 0");
        });
        migrationBuilder.CreateTable("pockets", schema: schema, columns: table => new
        {
            user_id = table.Column<Guid>(nullable: false),
            id = table.Column<string>(maxLength: 256, nullable: false),
            name = table.Column<string>(maxLength: 200, nullable: false),
            currency = table.Column<string>(maxLength: 3, nullable: false),
            target_amount = table.Column<decimal>(precision: 14, scale: 2, nullable: false),
            current_amount = table.Column<decimal>(precision: 14, scale: 2, nullable: false),
            emoji = table.Column<string>(maxLength: 64, nullable: false),
            color = table.Column<string>(maxLength: 64, nullable: true),
            created_at = table.Column<DateTime>(nullable: false),
            version = table.Column<long>(nullable: false)
        }, constraints: table =>
        {
            table.PrimaryKey("PK_pockets", x => new { x.user_id, x.id });
            table.ForeignKey("FK_pockets_finance_accounts_user_id", x => x.user_id, "finance_accounts", "user_id", principalSchema: schema, onDelete: ReferentialAction.Restrict);
            table.CheckConstraint("ck_pockets_currency", "currency IN ('DOP', 'USD')");
            table.CheckConstraint("ck_pockets_target", "CAST(target_amount AS NUMERIC) > 0 AND CAST(target_amount AS NUMERIC) <= 999999999999.99");
            table.CheckConstraint("ck_pockets_balance", "CAST(current_amount AS NUMERIC) >= 0 AND CAST(current_amount AS NUMERIC) <= 999999999999.99");
            table.CheckConstraint("ck_pockets_version", "version > 0");
        });
        migrationBuilder.CreateTable("movements", schema: schema, columns: table => new
        {
            user_id = table.Column<Guid>(nullable: false),
            id = table.Column<string>(maxLength: 256, nullable: false),
            currency = table.Column<string>(maxLength: 3, nullable: false),
            amount = table.Column<decimal>(precision: 14, scale: 2, nullable: false),
            type = table.Column<string>(maxLength: 7, nullable: false),
            category = table.Column<string>(maxLength: 32, nullable: false),
            occurred_at = table.Column<DateTime>(nullable: false),
            note = table.Column<string>(maxLength: 4000, nullable: true),
            pocket_id = table.Column<string>(maxLength: 256, nullable: true),
            version = table.Column<long>(nullable: false)
        }, constraints: table =>
        {
            table.PrimaryKey("PK_movements", x => new { x.user_id, x.id });
            table.ForeignKey("FK_movements_finance_accounts_user_id", x => x.user_id, "finance_accounts", "user_id", principalSchema: schema, onDelete: ReferentialAction.Restrict);
            table.ForeignKey("FK_movements_pockets_user_id_pocket_id", x => new { x.user_id, x.pocket_id }, "pockets", new[] { "user_id", "id" }, principalSchema: schema, onDelete: ReferentialAction.Restrict);
            table.CheckConstraint("ck_movements_currency", "currency IN ('DOP', 'USD')");
            table.CheckConstraint("ck_movements_amount", "CAST(amount AS NUMERIC) > 0 AND CAST(amount AS NUMERIC) <= 999999999999.99");
            table.CheckConstraint("ck_movements_type", "type IN ('ingreso', 'gasto')");
            table.CheckConstraint("ck_movements_category", "category IN ('comida', 'transporte', 'entretenimiento', 'servicios', 'salud', 'educacion', 'salario', 'ahorro', 'otros')");
            table.CheckConstraint("ck_movements_version", "version > 0");
        });
        migrationBuilder.CreateIndex("IX_movements_user_id_pocket_id", "movements", new[] { "user_id", "pocket_id" }, schema: schema);
        migrationBuilder.CreateIndex("IX_movements_user_id_occurred_at_id", "movements", new[] { "user_id", "occurred_at", "id" }, schema: schema);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("movements", ProviderSchema);
        migrationBuilder.DropTable("pockets", ProviderSchema);
        migrationBuilder.DropTable("finance_accounts", ProviderSchema);
    }

    protected override void BuildTargetModel(ModelBuilder modelBuilder)
    {
        modelBuilder.HasAnnotation("ProductVersion", "10.0.15");
        InitialNormalizedSnapshotModel.Configure(modelBuilder);
    }
}
