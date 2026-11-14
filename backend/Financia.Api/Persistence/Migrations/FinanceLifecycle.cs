using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Financia.Api.Persistence.Migrations;

[DbContext(typeof(NormalizedFinanceDb))]
[Migration("20261114000100_FinanceLifecycle")]
public sealed class FinanceLifecycle : Migration
{
    private string? ProviderSchema => ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL" ? "financia" : null;

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>("deleted_at", "movements", schema: ProviderSchema, nullable: true);
        migrationBuilder.AddColumn<DateTime>("closed_at", "pockets", schema: ProviderSchema, nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        if (ActiveProvider == "Microsoft.EntityFrameworkCore.Sqlite")
        {
            // The bundled SQLite supports DROP COLUMN; avoid schema-based rebuild lookup.
            migrationBuilder.Sql("ALTER TABLE \"movements\" DROP COLUMN \"deleted_at\";");
            migrationBuilder.Sql("ALTER TABLE \"pockets\" DROP COLUMN \"closed_at\";");
        }
        else
        {
            migrationBuilder.DropColumn("deleted_at", "movements", ProviderSchema);
            migrationBuilder.DropColumn("closed_at", "pockets", ProviderSchema);
        }
    }

    protected override void BuildTargetModel(ModelBuilder modelBuilder)
    {
        modelBuilder.HasAnnotation("ProductVersion", "10.0.15");
        FinanceLifecycleSnapshotModel.Configure(modelBuilder);
    }
}
