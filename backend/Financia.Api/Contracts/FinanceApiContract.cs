using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Schema;
using System.Text.Json.Serialization;
using Financia.Api.Features;

namespace Financia.Api.Contracts;

public sealed record FinanceOperation(string Method, string Path, string OperationId, Type? Request, Type Response, int SuccessStatus = 200);

public static class FinanceApiContract
{
    public static readonly IReadOnlyList<FinanceOperation> Operations = [
        new("GET", "/api/v2/finances", "getFinances", null, typeof(V2FinanceResponse)),
        new("POST", "/api/v2/imports/legacy", "importLegacy", typeof(ImportLegacyRequest), typeof(V2FinanceResponse)),
        new("POST", "/api/v2/movements", "createMovement", typeof(CreateMovementRequest), typeof(CreateMovementResponse), 201),
        new("PATCH", "/api/v2/movements/{id}", "updateMovement", typeof(UpdateMovementRequest), typeof(CreateMovementResponse)),
        new("DELETE", "/api/v2/movements/{id}", "deleteMovement", null, typeof(DeleteMovementResponse)),
        new("POST", "/api/v2/pockets", "createPocket", typeof(CreatePocketRequest), typeof(PocketResponse), 201),
        new("PATCH", "/api/v2/pockets/{id}", "editPocket", typeof(EditPocketRequest), typeof(PocketResponse)),
        new("POST", "/api/v2/pockets/{id}/deposit", "depositToPocket", typeof(PocketTransferRequest), typeof(PocketTransferResponse)),
        new("POST", "/api/v2/pockets/{id}/withdraw", "withdrawFromPocket", typeof(PocketTransferRequest), typeof(PocketTransferResponse)),
        new("POST", "/api/v2/pockets/{id}/close", "closePocket", typeof(ClosePocketRequest), typeof(PocketTransferResponse)),
    ];

    public static readonly IReadOnlyList<Type> DtoTypes = [
        typeof(CreateMovementRequest), typeof(UpdateMovementRequest), typeof(ImportLegacyRequest), typeof(LegacySnapshot),
        typeof(LegacyPocket), typeof(Movement), typeof(V2Movement), typeof(V2Pocket), typeof(V2Snapshot), typeof(V2FinanceResponse),
        typeof(CreateMovementResponse), typeof(CreatePocketRequest), typeof(EditPocketRequest), typeof(PocketTransferRequest),
        typeof(ClosePocketRequest), typeof(PocketResponse), typeof(PocketTransferResponse), typeof(DeleteMovementResponse),
    ];

    public static RouteHandlerBuilder WithFinanceContract(this RouteHandlerBuilder route, string operationId)
    {
        var operation = Operations.Single(x => x.OperationId == operationId);
        return route.WithName(operationId).Produces(operation.SuccessStatus, operation.Response, "application/json");
    }

    public static JsonObject CreateDocument()
    {
        var options = new JsonSerializerOptions(FinanceDb.JsonOptions) { NumberHandling = JsonNumberHandling.Strict };
        options.MakeReadOnly(populateMissingResolver: true);
        var schemas = new JsonObject();
        foreach (var type in DtoTypes.OrderBy(type => type.Name, StringComparer.Ordinal))
        {
            var schema = options.GetJsonSchemaAsNode(type, new JsonSchemaExporterOptions {
                TreatNullObliviousAsNonNullable = true,
            }).AsObject();
            NormalizeDto(schema, type);
            schemas[type.Name] = schema;
        }
        schemas["ApiError"] = JsonNode.Parse("""{"type":"object","properties":{"error":{"type":"string"},"movementIds":{"type":"array","items":{"type":"string"}}},"required":["error"]}""");
        schemas["ProblemDetails"] = JsonNode.Parse("""{"type":"object","properties":{"type":{"type":["string","null"]},"title":{"type":["string","null"]},"status":{"type":["integer","null"]},"detail":{"type":["string","null"]},"instance":{"type":["string","null"]}},"additionalProperties":true}""");
        var paths = new JsonObject();
        foreach (var operation in Operations)
        {
            if (paths[operation.Path] is not JsonObject path) paths[operation.Path] = path = new JsonObject();
            var responses = new JsonObject {
                [operation.SuccessStatus.ToString(System.Globalization.CultureInfo.InvariantCulture)] = Response("Success", operation.Response.Name),
                ["400"] = Response("Invalid request. Binding failures may have an empty body.", "ApiError"),
                ["401"] = new JsonObject { ["description"] = "Missing or invalid Bearer token. Empty body." },
                ["404"] = Response("Entity not found or belongs to another user.", "ApiError"),
                ["409"] = Response("Version, idempotency or financial constraint conflict. Retry concurrency failures with the same key.", "ApiError"),
                ["500"] = Response("Unexpected server error.", "ProblemDetails", "application/problem+json"),
            };
            var node = new JsonObject { ["operationId"] = operation.OperationId, ["responses"] = responses };
            var parameters = new JsonArray();
            if (operation.Method != "GET") parameters.Add(Parameter("Idempotency-Key", "header", new JsonObject { ["type"] = "string", ["minLength"] = 1, ["maxLength"] = 128 }));
            if (operation.Path.Contains("{id}", StringComparison.Ordinal)) parameters.Add(Parameter("id", "path", new JsonObject { ["type"] = "string", ["minLength"] = 1, ["maxLength"] = 256 }));
            if (operation.Method == "DELETE") parameters.Add(Parameter("expectedVersion", "query", new JsonObject { ["type"] = "string", ["pattern"] = "^[0-9]+$", ["description"] = "Positive Int64 version; maximum 9223372036854775807." }));
            if (parameters.Count > 0) node["parameters"] = parameters;
            if (operation.Request is not null) node["requestBody"] = new JsonObject {
                ["required"] = true, ["content"] = Content(operation.Request.Name, "application/json")
            };
            path[operation.Method.ToLowerInvariant()] = node;
        }
        return new JsonObject {
            ["openapi"] = "3.1.0",
            ["info"] = new JsonObject { ["title"] = "Financia API", ["version"] = "2.0.0", ["description"] = "Experimental authenticated finance API. Monetary values in v2 are decimal strings; legacy imports preserve numeric amounts. Generated offline from C# DTOs." },
            ["security"] = new JsonArray(new JsonObject { ["bearerAuth"] = new JsonArray() }),
            ["paths"] = paths,
            ["components"] = new JsonObject {
                ["securitySchemes"] = new JsonObject { ["bearerAuth"] = new JsonObject { ["type"] = "http", ["scheme"] = "bearer", ["bearerFormat"] = "JWT" } },
                ["schemas"] = schemas,
            },
        };
    }

    public static string Serialize() => CreateDocument().ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n";

    private static JsonObject Ref(string name) => new() { ["$ref"] = "#/components/schemas/" + name };
    private static JsonObject Content(string name, string mediaType) => new() { [mediaType] = new JsonObject { ["schema"] = Ref(name) } };
    private static JsonObject Response(string description, string name, string mediaType = "application/json") => new() { ["description"] = description, ["content"] = Content(name, mediaType) };
    private static JsonObject Parameter(string name, string location, JsonObject schema) => new() { ["name"] = name, ["in"] = location, ["required"] = true, ["schema"] = schema };

    private static void NormalizeDto(JsonObject schema, Type dto)
    {
        // Replace exporter-local references/inlined objects with stable named components.
        schema["type"] = "object";
        var properties = schema["properties"]!.AsObject();
        var required = schema["required"]?.AsArray() ?? new JsonArray();
        foreach (var property in dto.GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            var name = JsonNamingPolicy.CamelCase.ConvertName(property.Name);
            var propertySchema = properties[name]!.AsObject();
            var nullable = new NullabilityInfoContext().Create(property).ReadState == NullabilityState.Nullable;
            var propertyType = property.PropertyType;
            if (DtoTypes.Contains(propertyType))
                properties[name] = nullable ? new JsonObject { ["anyOf"] = new JsonArray(Ref(propertyType.Name), new JsonObject { ["type"] = "null" }) } : Ref(propertyType.Name);
            else if (propertyType.IsArray && DtoTypes.Contains(propertyType.GetElementType()!))
                propertySchema["items"] = Ref(propertyType.GetElementType()!.Name);
            if (property.GetCustomAttribute<JsonIgnoreAttribute>()?.Condition == JsonIgnoreCondition.WhenWritingNull)
            {
                for (var index = required.Count - 1; index >= 0; index--)
                    if (required[index]?.GetValue<string>() == name) required.RemoveAt(index);
                if (propertyType == typeof(string)) propertySchema["type"] = "string";
            }
            if (name == "currency") propertySchema["enum"] = new JsonArray("DOP", "USD");
            if (name == "type") propertySchema["enum"] = new JsonArray("ingreso", "gasto");
            if (name == "category") propertySchema["enum"] = new JsonArray((dto == typeof(CreateMovementRequest) || dto == typeof(UpdateMovementRequest)
                ? new[] { "comida", "transporte", "entretenimiento", "servicios", "salud", "educacion", "salario", "otros" }
                : new[] { "comida", "transporte", "entretenimiento", "servicios", "salud", "educacion", "salario", "ahorro", "otros" }).Select(x => (JsonNode?)JsonValue.Create(x)).ToArray());
            if (name is "amount" or "targetAmount" or "currentAmount")
            {
                if (propertyType == typeof(string)) propertySchema["pattern"] = "^[0-9]+(?:\\.[0-9]{1,2})?$";
                else { propertySchema["minimum"] = name == "currentAmount" ? 0 : 0.01m; propertySchema["maximum"] = 999999999999.99m; }
                propertySchema["description"] = "Decimal amount, at most two fractional digits; maximum 999999999999.99. Zero is allowed only for currentAmount.";
            }
            if (propertyType == typeof(string) && name is "revision" or "version" or "expectedVersion" or "legacyRevision")
                propertySchema["pattern"] = "^[0-9]+$";
            if (name == "expectedRevision") propertySchema["const"] = "0";
            if (name == "version" && dto == typeof(LegacySnapshot)) propertySchema["const"] = 1;
            if (name == "version" && dto == typeof(V2Snapshot)) propertySchema["const"] = 2;
            if (name == "deleted") propertySchema["const"] = true;
        }
        // Responses serialize every non-ignored property, including nullable transfer movement.
        if (dto.Name.EndsWith("Response", StringComparison.Ordinal) || dto.Name.StartsWith("V2", StringComparison.Ordinal))
            schema["required"] = new JsonArray(properties.Select(p => p.Key).Where(name =>
                dto.GetProperties().Single(p => JsonNamingPolicy.CamelCase.ConvertName(p.Name) == name)
                    .GetCustomAttribute<JsonIgnoreAttribute>()?.Condition != JsonIgnoreCondition.WhenWritingNull)
                .Select(x => (JsonNode?)JsonValue.Create(x)).ToArray());
    }
}
