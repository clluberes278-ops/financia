using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Financia.Api;

// The existing identity provider validates the token. Client-supplied owner IDs are never trusted.
public sealed class SessionAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger, UrlEncoder encoder, IHttpClientFactory clients, IConfiguration config)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!AuthenticationHeaderValue.TryParse(Request.Headers.Authorization, out var header)
            || !header.Scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(header.Parameter)) return AuthenticateResult.NoResult();
        var baseUrl = config["Authentication:SupabaseUrl"];
        var key = config["Authentication:PublishableKey"];
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) || uri.Scheme != "https" || string.IsNullOrEmpty(key))
            return AuthenticateResult.Fail("Proveedor de identidad no configurado.");
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(uri, "/auth/v1/user"));
        request.Headers.Authorization = header;
        request.Headers.Add("apikey", key);
        try
        {
            using var response = await clients.CreateClient("identity").SendAsync(request, Context.RequestAborted);
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                return AuthenticateResult.Fail("Sesión inválida o vencida.");
            response.EnsureSuccessStatusCode();
            using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(Context.RequestAborted), cancellationToken: Context.RequestAborted);
            if (!json.RootElement.TryGetProperty("id", out var id) || !Guid.TryParse(id.GetString(), out var owner))
                return AuthenticateResult.Fail("La sesión no tiene un usuario válido.");
            var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, owner.ToString())], Scheme.Name));
            return AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name));
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException or JsonException)
        {
            // No token, response body or financial information is logged.
            Logger.LogWarning("El proveedor de identidad no pudo validar la sesión.");
            return AuthenticateResult.Fail("No se pudo validar la sesión. Inténtalo de nuevo.");
        }
    }
    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        Response.Headers.WWWAuthenticate = "Bearer";
        return Task.CompletedTask;
    }
}
