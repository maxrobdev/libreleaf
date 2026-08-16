import { handleMcpRequest } from "../../mcp/http";

export default async function mcp(request: Request): Promise<Response> {
  return handleMcpRequest(request, {
    searchHandler(searchRequest) {
      const incoming = new URL(searchRequest.url);
      const resolver = new URL("/api/search", request.url);
      resolver.search = incoming.search;
      return fetch(resolver, { headers: { Accept: "application/json" } });
    },
  });
}
