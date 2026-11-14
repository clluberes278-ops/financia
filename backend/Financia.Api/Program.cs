using System.Security.Claims;
using System.Data;
using System.Text.Json;
using Financia.Api;
using Financia.Api.Features;
using Financia.Api.Persistence;
using Financia.Api.Realtime;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
// Browser WebSocket/SSE authentication carries access_token in the query string.
// Do not send full request URLs to the default hosting request logger.
builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 16 * 1024 * 1024);
builder.Services.AddHttpClient("identity", client => client.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddAuthentication("Session").AddScheme<AuthenticationSchemeOptions, SessionAuthentication>("Session", _ => { });
builder.Services.AddAuthorization();
builder.Services.AddSignalR();
builder.Services.AddSingleton<IUserIdProvider, FinanceUserIdProvider>();
builder.Services.AddScoped<FinanceOutboxPublisher>();
if (NormalizedFinances.Enabled(builder.Configuration) && !builder.Environment.IsEnvironment("Testing"))
    builder.Services.AddHostedService<FinanceOutboxWorker>();
builder.Services.AddCors(options => {
    var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
    options.AddDefaultPolicy(policy => {
        if (origins.Length > 0) policy.WithOrigins(origins).AllowAnyHeader().WithMethods("GET", "PUT", "POST", "PATCH", "DELETE");
    });
    options.AddPolicy("Realtime", policy => {
        if (origins.Length > 0) policy.WithOrigins(origins).AllowAnyHeader().WithMethods("GET", "POST", "DELETE").AllowCredentials();
    });
});
builder.Services.AddDbContext<FinanceDb>(options => {
    var postgres = builder.Configuration.GetConnectionString("Postgres");
    if (!string.IsNullOrWhiteSpace(postgres)) options.UseNpgsql(postgres);
    else options.UseSqlite(builder.Configuration.GetConnectionString("Sqlite") ?? "Data Source=financia.db");
});
builder.Services.AddDbContext<NormalizedFinanceDb>(options => {
    var postgres = builder.Configuration.GetConnectionString("Postgres");
    if (!string.IsNullOrWhiteSpace(postgres)) options.UseNpgsql(postgres,
        provider => provider.MigrationsHistoryTable(NormalizedFinanceDb.MigrationsHistoryTable, NormalizedFinanceDb.Schema));
    else options.UseSqlite(builder.Configuration.GetConnectionString("Sqlite") ?? "Data Source=financia.db",
        provider => provider.MigrationsHistoryTable(NormalizedFinanceDb.MigrationsHistoryTable));
});
var app = builder.Build();
app.UseExceptionHandler();
if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing")) app.UseHttpsRedirection();
app.UseCors();
app.Use(async (context, next) => {
    // WebSockets do not enforce CORS. Native clients may omit Origin; browsers may not choose an arbitrary origin.
    if (context.Request.Path.Equals("/hubs/finances") && context.Request.Headers.ContainsKey("Origin"))
    {
        var origins = app.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
        if (context.Request.Headers.Origin.Count != 1 || !origins.Contains(context.Request.Headers.Origin.ToString(), StringComparer.Ordinal))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
    }
    await next(context);
});
app.UseAuthentication();
app.UseAuthorization();

// Explicit initialization: production deployments run --initialize-database once.
if (args.Contains("--initialize-database") || app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<FinanceDb>().Database.EnsureCreatedAsync();
}
if (args.Contains("--migrate-v2") && !NormalizedFinances.Enabled(app.Configuration))
    throw new InvalidOperationException("Activa FinanceV2:Enabled para ejecutar --migrate-v2.");
if (NormalizedFinances.Enabled(app.Configuration) && (args.Contains("--migrate-v2")
    || app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing")))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<NormalizedFinanceDb>().Database.MigrateAsync();
}
if (args.Contains("--initialize-database") || args.Contains("--migrate-v2")) return;
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
var api = app.MapGroup("/api").RequireAuthorization();
api.AddEndpointFilter(async (context, next) => {
    try { return await next(context); }
    catch (Exception error) when (NormalizedFinances.IsWriteConflict(error))
    {
        return Results.Conflict(new { error = "El historial cambió durante la operación. Recarga antes de guardar." });
    }
});
api.MapGet("/finances", async (ClaimsPrincipal user, FinanceDb db, NormalizedFinanceDb normalized, CancellationToken ct) => {
    var owner = Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    if ((NormalizedFinances.Enabled(app.Configuration) || await NormalizedFinances.HasStorage(normalized, ct))
        && await normalized.Accounts.AsNoTracking().AnyAsync(x => x.UserId == owner, ct))
        return Results.Conflict(new { error = "Esta cuenta ya usa la API v2. Actualiza el cliente para consultar sus datos." });
    var row = await db.Documents.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerId == owner, ct);
    return Results.Ok(row is null ? new FinanceResponse(0, FinancialSnapshot.Empty)
        : new FinanceResponse(row.Revision, JsonSerializer.Deserialize<FinancialSnapshot>(row.Json, FinanceDb.JsonOptions)!));
});
api.MapPut("/finances", async (SaveFinanceRequest request, ClaimsPrincipal user, FinanceDb db, NormalizedFinanceDb normalized, CancellationToken ct) => {
    if (request.Snapshot is null || request.ExpectedRevision < 0 || request.ExpectedRevision == long.MaxValue)
        return Results.BadRequest(new { error = "Solicitud inválida." });
    var validation = request.Snapshot.Validate();
    if (validation is not null) return Results.BadRequest(new { error = validation });
    var owner = Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    // Both import and legacy writes use the same serializable database transaction boundary.
    // PostgreSQL can reject a race; the caller must reload instead of silently forking histories.
    var v2 = NormalizedFinances.Enabled(app.Configuration) || await NormalizedFinances.HasStorage(normalized, ct);
    DbContext writeDb = v2 ? normalized : db;
    await using var transaction = v2 ? await normalized.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct) : null;
    if (v2 && await normalized.Accounts.AsNoTracking().AnyAsync(x => x.UserId == owner, ct))
        return Results.Conflict(new { error = "Esta cuenta ya usa la API v2. Actualiza el cliente antes de guardar." });
    var documents = writeDb.Set<FinanceDocument>();
    var row = await documents.SingleOrDefaultAsync(x => x.OwnerId == owner, ct);
    if ((row?.Revision ?? 0) != request.ExpectedRevision) return Results.Conflict(new { error = "El historial cambió en otro dispositivo. Recarga antes de guardar." });
    if (row is null) { row = new FinanceDocument { OwnerId = owner }; documents.Add(row); }
    row.Revision++;
    row.Json = JsonSerializer.Serialize(request.Snapshot, FinanceDb.JsonOptions);
    try { await writeDb.SaveChangesAsync(ct); }
    catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "El historial cambió. Vuelve a intentarlo." }); }
    catch (DbUpdateException) when (!v2 && request.ExpectedRevision == 0) {
        // A simultaneous first save can race on the unique owner key.
        if (await db.Documents.AsNoTracking().AnyAsync(x => x.OwnerId == owner, ct))
            return Results.Conflict(new { error = "Ya existe un historial. Vuelve a cargarlo." });
        throw;
    }
    if (transaction is not null) await transaction.CommitAsync(ct);
    return Results.Ok(new FinanceResponse(row.Revision, request.Snapshot));
});
if (NormalizedFinances.Enabled(app.Configuration))
{
    app.MapNormalizedFinances();
    app.MapHub<FinanceHub>("/hubs/finances", options => options.CloseOnAuthenticationExpiration = true).RequireCors("Realtime");
}
app.Run();
public partial class Program { }
