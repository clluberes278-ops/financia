using Financia.Api.Features;

namespace Financia.Api.Contracts;

public sealed record PocketResponse(string Revision, V2Pocket Pocket);
public sealed record PocketTransferResponse(string Revision, V2Pocket Pocket, V2Movement? Movement);
public sealed record DeleteMovementResponse(string Revision, string Id, string Version, bool Deleted = true);
