const publicApiHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Content-Type",
  "Access-Control-Expose-Headers": "Cache-Control, Retry-After, X-LibreLeaf-API-Version",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-LibreLeaf-API-Version": "1",
};

export function withPublicApiHeaders(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(publicApiHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function publicApiOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...publicApiHeaders,
      "Access-Control-Max-Age": "86400",
      Allow: "GET, OPTIONS",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export function publicApiMethodNotAllowed() {
  return Response.json(
    { error: "method_not_allowed", message: "This public endpoint supports GET and OPTIONS only." },
    {
      status: 405,
      headers: {
        ...publicApiHeaders,
        Allow: "GET, OPTIONS",
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function dispatchPublicApiRequest(request: Request, get: () => Promise<Response>) {
  if (request.method === "GET") return get();
  if (request.method === "OPTIONS") return publicApiOptions();
  return publicApiMethodNotAllowed();
}
