import assert from "node:assert/strict";
import test from "node:test";

import { handleMcpRequest } from "../mcp/http";

const mcpHeaders = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
};

async function mcpRequest(body: unknown) {
  return handleMcpRequest(new Request("https://libreleaf.example/mcp", {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify(body),
  }));
}

test("initializes through Streamable HTTP with server instructions", async () => {
  const response = await mcpRequest({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "libreleaf-test", version: "1.0.0" },
    },
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  const payload = await response.json() as {
    result: { serverInfo: { name: string }; instructions?: string };
  };
  assert.equal(payload.result.serverInfo.name, "libreleaf");
  assert.match(payload.result.instructions ?? "", /lawful public-domain/i);
});

test("advertises one focused read-only search tool", async () => {
  const response = await mcpRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const payload = await response.json() as {
    result: { tools: Array<{ name: string; annotations: Record<string, boolean> }> };
  };
  assert.equal(payload.result.tools.length, 1);
  assert.equal(payload.result.tools[0]?.name, "search_books");
  assert.deepEqual(payload.result.tools[0]?.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  });
});

test("search_books returns bounded normalized records without live network", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let fetchCount = 0;

  globalThis.fetch = async (input) => {
    fetchCount += 1;
    const target = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    const url = new URL(target);
    if (url.hostname === "gutendex.com") {
      return Response.json({
        count: 1,
        next: null,
        results: [{
          id: 1342,
          title: "Pride and Prejudice",
          authors: [{ name: "Austen, Jane" }],
          formats: {
            "application/epub+zip": "https://www.gutenberg.org/ebooks/1342.epub3.images",
            "image/jpeg": "https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg",
          },
        }],
      });
    }
    if (url.hostname === "openlibrary.org") {
      return Response.json({
        numFound: 2,
        docs: [{
          key: "/works/OL66554W",
          title: "Pride and Prejudice",
          author_name: ["Jane Austen"],
          first_publish_year: 1813,
          ebook_access: "borrowable",
        }, {
          key: "/works/OL123W",
          title: "Jane Austen: A Life",
          author_name: ["Claire Tomalin"],
          first_publish_year: 1997,
          ebook_access: "no_ebook",
        }],
      });
    }
    if (url.hostname === "en.wikisource.org") {
      return Response.json({ batchcomplete: true, query: { searchinfo: { totalhits: 0 }, pages: [] } });
    }
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    throw new Error(`Unexpected request to ${url}`);
  };

  const response = await mcpRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "search_books",
      arguments: { query: "Jane Austen", search_by: "author", limit: 2 },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(fetchCount, 4);
  const payload = await response.json() as {
    result: {
      isError?: boolean;
      structuredContent: {
        query: string;
        searchBy: string;
        returned: number;
        rightsContext: { region: string };
        books: Array<{ title: string; source: string; detailsUrl: string }>;
      };
    };
  };
  assert.equal(payload.result.isError, undefined);
  assert.equal(payload.result.structuredContent.query, "Jane Austen");
  assert.equal(payload.result.structuredContent.searchBy, "author");
  assert.equal(payload.result.structuredContent.returned, 2);
  assert.equal(payload.result.structuredContent.rightsContext.region, "GB");
  assert.equal(payload.result.structuredContent.books[0]?.source, "Project Gutenberg + Open Library");
  assert.match(payload.result.structuredContent.books[0]?.detailsUrl ?? "", /^https:\/\//);
});

test("rejects invalid tool input before calling a catalogue", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };

  const response = await mcpRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "search_books",
      arguments: { query: "", limit: 200 },
    },
  });

  const payload = await response.json() as { result: { isError?: boolean } };
  assert.equal(payload.result.isError, true);
});

test("answers CORS preflight without creating a session", async () => {
  const response = await handleMcpRequest(new Request("https://libreleaf.example/mcp", {
    method: "OPTIONS",
  }));
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);
});
