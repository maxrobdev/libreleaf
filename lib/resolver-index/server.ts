import { createServer, type ServerResponse } from "node:http";
import { ResolverIndex } from "./database.ts";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const headers = {
  ...securityHeaders,
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=30, stale-while-revalidate=300",
};

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, headers);
  response.end(`${JSON.stringify(value)}\n`);
}

type IndexHttpResult = { status: number; payload?: unknown };

export function resolveIndexHttpRequest(index: ResolverIndex, request: { method?: string; url?: string }): IndexHttpResult {
  const method = request.method ?? "GET";
  if (method === "OPTIONS") return { status: 204 };
  if (method !== "GET" && method !== "HEAD") return { status: 405, payload: { error: "Read-only service. Use GET." } };
  try {
    if (!request.url || request.url.length > 2_048) throw new Error("Request URL is too long.");
    const url = new URL(request.url, "http://resolver-index.local");
    let payload: unknown;
    if (url.pathname === "/v1/status") {
      payload = { service: "LibreLeaf resolver index", status: "ok", ...index.stats() };
    } else if (url.pathname === "/v1/search") {
      const region = url.searchParams.get("region") ?? "GB";
      if (region !== "GB" && region !== "US" && region !== "GLOBAL") {
        return { status: 400, payload: { error: "region must be GB, US or GLOBAL." } };
      }
      const rawLimit = url.searchParams.get("limit") ?? "24";
      if (!/^\d{1,3}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100) {
        return { status: 400, payload: { error: "limit must be an integer from 1 to 100." } };
      }
      payload = index.search(url.searchParams.get("q") ?? "", { limit: Number(rawLimit), region });
    } else {
      return { status: 404, payload: { error: "Not found.", endpoints: ["/v1/status", "/v1/search?q=Frankenstein"] } };
    }
    return { status: 200, ...(method === "HEAD" ? {} : { payload }) };
  } catch (error) {
    return { status: 400, payload: { error: error instanceof Error ? error.message : "Invalid request." } };
  }
}

export function createResolverIndexServer(index: ResolverIndex) {
  return createServer((request, response) => {
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    const result = resolveIndexHttpRequest(index, request);
    if (result.status === 204) {
      response.writeHead(204, securityHeaders);
      response.end();
      return;
    }
    if (request.method === "HEAD" && result.status === 200) {
      response.writeHead(200, headers);
      response.end();
    } else {
      json(response, result.status, result.payload);
    }
  });
}
