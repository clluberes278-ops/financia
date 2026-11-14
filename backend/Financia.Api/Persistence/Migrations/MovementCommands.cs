using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Financia.Api.Persistence.Migrations;

[DbContext(typeof(NormalizedFinanceDb))]
[Migration("20261113000200_MovementCommands")]
public sealed class MovementCommands : Migration
{
    private string? ProviderSchema => ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL" ? "financia" : null;

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        var schema = ProviderSchema;
        migrationBuilder.AddColumn<string>("import_response_json", "finance_accounts", schema: schema, nullable: true);
        migrationBuilder.CreateTable("command_receipts", schema: schema, columns: table => new
        {
            user_id = table.Column<Guid>(nullable: false),
            key = table.Column<string>(maxLength: 128, nullable: false),
            operation = table.Column<string>(maxLength: 64, nullable: false),
            request_hash = table.Column<string>(maxLength: 64, nullable: false),
            response_json = table.Column<string>(nullable: false),
            status_code = table.Column<int>(nullable: false),
            created_at = table.Column<DateTime>(nullable: false)
        }, constraints: table =>
        {
            table.PrimaryKey("PK_command_receipts", x => new { x.user_id, x.key });
            table.ForeignKey("FK_command_receipts_finance_accounts_user_id", x => x.user_id, "finance_accounts", "user_id", principalSchema: schema, onDelete: ReferentialAction.Restrict);
            table.CheckConstraint("ck_command_receipts_status", "status_code >= 100 AND status_code <= 599");
        });
        migrationBuilder.CreateTable("finance_outbox", schema: schema, columns: table => new
        {
            event_id = table.Column<Guid>(nullable: false),
            user_id = table.Column<Guid>(nullable: false),
            revision = table.Column<long>(nullable: false),
            created_at = table.Column<DateTime>(nullable: false),
            published_at = table.Column<DateTime>(nullable: true)
        }, constraints: table =>
        {
            table.PrimaryKey("PK_finance_outbox", x => x.event_id);
            table.ForeignKey("FK_finance_outbox_finance_accounts_user_id", x => x.user_id, "finance_accounts", "user_id", principalSchema: schema, onDelete: ReferentialAction.Restrict);
            table.CheckConstraint("ck_finance_outbox_revision", "revision > 0");
        });
        migrationBuilder.CreateIndex("IX_finance_outbox_user_id_revision", "finance_outbox", new[] { "user_id", "revision" }, schema: schema, unique: true);
        migrationBuilder.CreateIndex("IX_finance_outbox_unpublished_created", "finance_outbox", new[] { "created_at", "event_id" }, schema: schema, filter: "published_at IS NULL");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("command_receipts", ProviderSchema);
        migrationBuilder.DropTable("finance_outbox", ProviderSchema);
        if (ActiveProvider == "Microsoft.EntityFrameworkCore.Sqlite")
            // The bundled SQLite supports DROP COLUMN; bypass schema-based table rebuild lookup.
            migrationBuilder.Sql("ALTER TABLE \"finance_accounts\" DROP COLUMN \"import_response_json\";");
        else
            migrationBuilder.DropColumn("import_response_json", "finance_accounts", ProviderSchema);
    }

    protected override void BuildTargetModel(ModelBuilder modelBuilder)
    {
        modelBuilder.HasAnnotation("ProductVersion", "10.0.15");
        MovementCommandsSnapshotModel.Configure(modelBuilder);
    }
}
