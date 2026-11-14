using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace Financia.Api.Persistence.Migrations;

[DbContext(typeof(NormalizedFinanceDb))]
public sealed class NormalizedFinanceDbModelSnapshot : ModelSnapshot
{
    protected override void BuildModel(ModelBuilder modelBuilder)
    {
        modelBuilder.HasAnnotation("ProductVersion", "10.0.15");
        FinanceLifecycleSnapshotModel.Configure(modelBuilder);
    }
}
