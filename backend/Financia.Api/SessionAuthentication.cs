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
        var authorization = Request.Headers.Authorization.ToString();
        if (string.IsNullOrEmpty(authorization) && HttpMethods.IsGet(Request.Method)
            && Request.Path.Equals("/hubs/finances") && Request.Query["access_token"].Count == 1)
            authorization = "Bearer " + Request.Query["access_token"].ToString();
        if (!AuthenticationHeaderValue.TryParse(authorization, out var header)
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
            // Only read expiry after the identity service has validated this token.
            // The claim is used to close persistent connections, never to authenticate a token offline.
            var expires = ReadExpiry(header.Parameter);
            if (expires is not null && expires <= DateTimeOffset.UtcNow)
                return AuthenticateResult.Fail("La sesión venció.");
            var properties = new AuthenticationProperties { ExpiresUtc = expires ?? DateTimeOffset.UtcNow.AddMinutes(5) };
            return AuthenticateResult.Success(new AuthenticationTicket(principal, properties, Scheme.Name));
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException or JsonException)
        {
            // No token, response body or financial information is logged.
            Logger.LogWarning("El proveedor de identidad no pudo validar la sesión.");
            return AuthenticateResult.Fail("No se pudo validar la sesión. Inténtalo de nuevo.");
        }
    }

    private static DateTimeOffset? ReadExpiry(string token)
    {
        if (token.Length > 16384) return null;
        var parts = token.Split('.');
        if (parts.Length != 3) return null;
        try
        {
            var payload = parts[1].Replace('-', '+').Replace('_', '/');
            using var json = JsonDocument.Parse(Convert.FromBase64String(payload.PadRight((payload.Length + 3) / 4 * 4, '=')));
            return json.RootElement.TryGetProperty("exp", out var exp) && exp.TryGetInt64(out var seconds)
                ? DateTimeOffset.FromUnixTimeSeconds(seconds) : null;
        }
        catch (Exception error) when (error is FormatException or JsonException or ArgumentOutOfRangeException or InvalidOperationException)
        {
            return null;
        }
    }
    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        Response.Headers.WWWAuthenticate = "Bearer";
        return Task.CompletedTask;
    }
}
