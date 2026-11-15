using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Financia.Api.Contracts;
using Financia.Api.Features;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Financia.Api.Tests;

public sealed class ApiContractTests
{
    [Fact]
    public async Task PublishedOperationsMatchActualRoutesRequestTypesAndResponseMetadata()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var endpoints = factory.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>()
            .Where(endpoint => endpoint.RoutePattern.RawText!.StartsWith("/api/v2/", StringComparison.Ordinal)).ToArray();
        Assert.Equal(FinanceApiContract.Operations.Count, endpoints.Length);
        foreach (var operation in FinanceApiContract.Operations)
        {
            var endpoint = Assert.Single(endpoints, endpoint => endpoint.RoutePattern.RawText == operation.Path
                && endpoint.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods.Contains(operation.Method));
            Assert.Equal(operation.OperationId, endpoint.Metadata.GetMetadata<IEndpointNameMetadata>()!.EndpointName);
            var produced = Assert.Single(endpoint.Metadata.GetOrderedMetadata<IProducesResponseTypeMetadata>(),
                metadata => metadata.StatusCode == operation.SuccessStatus);
            Assert.Equal(operation.Response, produced.Type);
            Assert.Contains("application/json", produced.ContentTypes);
            var method = endpoint.Metadata.GetMetadata<MethodInfo>();
            Assert.NotNull(method);
            if (operation.Request is not null)
            {
                Assert.Contains(method.GetParameters(), parameter => parameter.ParameterType == operation.Request);
                Assert.Equal(operation.Request, endpoint.Metadata.GetMetadata<IAcceptsMetadata>()!.RequestType);
            }
            else Assert.DoesNotContain(method.GetParameters(), parameter => FinanceApiContract.DtoTypes.Contains(parameter.ParameterType));
        }
    }

    [Fact]
    public void SchemasPreserveDtoPropertiesMoneyKindsAndRequestStrictness()
    {
        var schemas = FinanceApiContract.CreateDocument()["components"]!["schemas"]!.AsObject();
        foreach (var type in FinanceApiContract.DtoTypes)
        {
            var schema = schemas[type.Name]!;
            Assert.Equal("object", schema["type"]!.GetValue<string>());
            Assert.Equal(type.GetProperties().Select(property => JsonNamingPolicy.CamelCase.ConvertName(property.Name)).Order(),
                schema["properties"]!.AsObject().Select(property => property.Key).Order());
        }
        Assert.Equal("number", schemas["Movement"]!["properties"]!["amount"]!["type"]!.GetValue<string>());
        Assert.Equal("number", schemas["LegacyPocket"]!["properties"]!["targetAmount"]!["type"]!.GetValue<string>());
        Assert.Equal("string", schemas["V2Movement"]!["properties"]!["amount"]!["type"]!.GetValue<string>());
        Assert.Equal("string", schemas["V2Pocket"]!["properties"]!["currentAmount"]!["type"]!.GetValue<string>());
        foreach (var type in FinanceApiContract.Operations.Select(x => x.Request).OfType<Type>().Distinct())
        {
            if (type == typeof(ImportLegacyRequest)) Assert.Null(schemas[type.Name]!["additionalProperties"]);
            else Assert.False(schemas[type.Name]!["additionalProperties"]!.GetValue<bool>());
        }
        Assert.Equal(new[] { "DOP", "USD" }, schemas["V2Movement"]!["properties"]!["currency"]!["enum"]!.AsArray().Select(x => x!.GetValue<string>()));
        Assert.DoesNotContain("ahorro", schemas["CreateMovementRequest"]!["properties"]!["category"]!["enum"]!.AsArray().Select(x => x!.GetValue<string>()));
        Assert.Contains("ahorro", schemas["Movement"]!["properties"]!["category"]!["enum"]!.AsArray().Select(x => x!.GetValue<string>()));
    }

    [Fact]
    public void NullableAndOmittedResponseMembersMatchSerialization()
    {
        var schemas = FinanceApiContract.CreateDocument()["components"]!["schemas"]!;
        var pocket = new V2Pocket("p", "Ahorro", "DOP", "100.00", "0.00", "", "2026-11-14T00:00:00Z", null, "1");
        var response = JsonSerializer.SerializeToNode(new PocketTransferResponse("2", pocket, null), FinanceDb.JsonOptions)!;
        Assert.True(response.AsObject().ContainsKey("movement"));
        Assert.Null(response["movement"]);
        Assert.Contains("movement", schemas["PocketTransferResponse"]!["required"]!.AsArray().Select(x => x!.GetValue<string>()));
        Assert.Equal("null", schemas["PocketTransferResponse"]!["properties"]!["movement"]!["anyOf"]![1]!["type"]!.GetValue<string>());
        Assert.False(response["pocket"]!.AsObject().ContainsKey("color"));
        Assert.DoesNotContain("color", schemas["V2Pocket"]!["required"]!.AsArray().Select(x => x!.GetValue<string>()));
        var deleted = JsonSerializer.SerializeToNode(new DeleteMovementResponse("3", "m", "2"), FinanceDb.JsonOptions)!;
        Assert.True(deleted["deleted"]!.GetValue<bool>());
        Assert.True(schemas["DeleteMovementResponse"]!["properties"]!["deleted"]!["const"]!.GetValue<bool>());
    }

    [Fact]
    public void DocumentIsDeterministicUsesOnlyNamedReferencesAndRequiresAuthAndWriteKeys()
    {
        Assert.Equal(FinanceApiContract.Serialize(), FinanceApiContract.Serialize());
        var document = FinanceApiContract.CreateDocument();
        Assert.Equal("3.1.0", document["openapi"]!.GetValue<string>());
        Assert.NotNull(document["security"]![0]!["bearerAuth"]);
        Walk(document);
        foreach (var operation in FinanceApiContract.Operations)
        {
            var node = document["paths"]![operation.Path]![operation.Method.ToLowerInvariant()]!;
            if (operation.Method != "GET") Assert.Contains(node["parameters"]!.AsArray(), p => p!["name"]!.GetValue<string>() == "Idempotency-Key" && p["required"]!.GetValue<bool>());
            if (operation.Request is not null) Assert.True(node["requestBody"]!["required"]!.GetValue<bool>());
            foreach (var status in new[] { "400", "401", "404", "409", "500" }) Assert.NotNull(node["responses"]![status]);
        }
        void Walk(JsonNode? node)
        {
            if (node is JsonObject obj)
            {
                if (obj["$ref"] is JsonValue value)
                {
                    var reference = value.GetValue<string>();
                    Assert.StartsWith("#/components/schemas/", reference);
                    Assert.NotNull(document["components"]!["schemas"]![reference.Split('/').Last()]);
                }
                foreach (var property in obj) Walk(property.Value);
            }
            else if (node is JsonArray array) foreach (var item in array) Walk(item);
        }
    }
}
