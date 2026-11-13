using System.Security.Claims;
using System.Text.Json;
using Financia.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 16 * 1024 * 1024);
builder.Services.AddHttpClient("identity", client => client.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddAuthentication("Session").AddScheme<AuthenticationSchemeOptions, SessionAuthentication>("Session", _ => { });
builder.Services.AddAuthorization();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => {
    var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
    if (origins.Length > 0) policy.WithOrigins(origins).AllowAnyHeader().WithMethods("GET", "PUT");
}));
builder.Services.AddDbContext<FinanceDb>(options => {
    var postgres = builder.Configuration.GetConnectionString("Postgres");
    if (!string.IsNullOrWhiteSpace(postgres)) options.UseNpgsql(postgres);
    else options.UseSqlite(builder.Configuration.GetConnectionString("Sqlite") ?? "Data Source=financia.db");
});
var app = builder.Build();
app.UseExceptionHandler();
if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing")) app.UseHttpsRedirection();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// Explicit initialization: production deployments run --initialize-database once.
if (args.Contains("--initialize-database") || app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<FinanceDb>().Database.EnsureCreatedAsync();
    if (args.Contains("--initialize-database")) return;
}
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
var api = app.MapGroup("/api").RequireAuthorization();
api.MapGet("/finances", async (ClaimsPrincipal user, FinanceDb db, CancellationToken ct) => {
    var owner = Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    var row = await db.Documents.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerId == owner, ct);
    return Results.Ok(row is null ? new FinanceResponse(0, FinancialSnapshot.Empty)
        : new FinanceResponse(row.Revision, JsonSerializer.Deserialize<FinancialSnapshot>(row.Json, FinanceDb.JsonOptions)!));
});
api.MapPut("/finances", async (SaveFinanceRequest request, ClaimsPrincipal user, FinanceDb db, CancellationToken ct) => {
    if (request.Snapshot is null || request.ExpectedRevision < 0 || request.ExpectedRevision == long.MaxValue)
        return Results.BadRequest(new { error = "Solicitud inválida." });
    var validation = request.Snapshot.Validate();
    if (validation is not null) return Results.BadRequest(new { error = validation });
    var owner = Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    var row = await db.Documents.SingleOrDefaultAsync(x => x.OwnerId == owner, ct);
    if ((row?.Revision ?? 0) != request.ExpectedRevision) return Results.Conflict(new { error = "El historial cambió en otro dispositivo. Recarga antes de guardar." });
    if (row is null) { row = new FinanceDocument { OwnerId = owner }; db.Documents.Add(row); }
    row.Revision++;
    row.Json = JsonSerializer.Serialize(request.Snapshot, FinanceDb.JsonOptions);
    try { await db.SaveChangesAsync(ct); }
    catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "El historial cambió. Vuelve a intentarlo." }); }
    catch (DbUpdateException) when (request.ExpectedRevision == 0) {
        // A simultaneous first save can race on the unique owner key.
        if (await db.Documents.AsNoTracking().AnyAsync(x => x.OwnerId == owner, ct))
            return Results.Conflict(new { error = "Ya existe un historial. Vuelve a cargarlo." });
        throw;
    }
    return Results.Ok(new FinanceResponse(row.Revision, request.Snapshot));
});
app.Run();
public partial class Program { }
