import assert from "node:assert/strict";
import test from "node:test";

import { handleMcpRequest } from "../mcp/http";
import type { SearchDependencies } from "../mcp/server";

const mcpHeaders = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
};

async function mcpRequest(body: unknown, dependencies: SearchDependencies = {}) {
  return handleMcpRequest(new Request("https://libreleaf.example/mcp", {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify(body),
  }), dependencies);
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

test("advertises standard research tools and focused resolver tools", async () => {
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
  assert.deepEqual(payload.result.tools.map((tool) => tool.name), ["search", "fetch", "search_books", "resolve_access"]);
  for (const tool of payload.result.tools) {
    assert.deepEqual(tool.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });
  }
});

test("search and fetch expose stable citation-ready work records", async () => {
  const requests: Array<{ query: string | null; by: string | null }> = [];
  const offer = {
    source: "Project Gutenberg",
    access: "download",
    label: "Download EPUB",
    format: "EPUB",
    url: "https://www.gutenberg.org/ebooks/1342.epub3.images",
    rights: {
      status: "source-assessed-public-domain",
      jurisdiction: "US",
      note: "Project Gutenberg marks this edition as public domain in the United States.",
      applicability: "source-jurisdiction-only",
    },
  };
  const searchHandler = async (request: Request) => {
    const url = new URL(request.url);
    requests.push({ query: url.searchParams.get("q"), by: url.searchParams.get("by") });
    return Response.json({
      query: url.searchParams.get("q"),
      books: [{
        id: "gutenberg-1342",
        title: "Pride and Prejudice",
        authors: ["Austen, Jane"],
        year: 1813,
        source: "Project Gutenberg",
        access: "download",
        formats: [{ label: "EPUB", url: offer.url }],
        detailsUrl: "https://www.gutenberg.org/ebooks/1342",
        clusterConfidence: "probable",
        why: ["Matched in Project Gutenberg."],
        offers: [offer],
        sourceRecords: [{
          source: "Project Gutenberg",
          recordId: "1342",
          detailsUrl: "https://www.gutenberg.org/ebooks/1342",
          offers: [offer],
        }],
      }],
      sources: { gutenberg: "ok", openLibrary: "timeout", wikisource: "exhausted", doab: "exhausted", libraryOfCongress: "exhausted" },
      rightsContext: {
        region: "GB",
        label: "United Kingdom",
        note: "Check local law and edition-specific terms.",
      },
    });
  };

  const searchResponse = await mcpRequest({
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: { name: "search", arguments: { query: "Pride and Prejudice" } },
  }, { searchHandler });
  const searchPayload = await searchResponse.json() as {
    result: {
      content: Array<{ type: string; text: string }>;
      structuredContent: { results: Array<{ id: string; title: string; url: string }> };
    };
  };
  const result = searchPayload.result.structuredContent.results[0];
  assert.match(result.id, /^llw1\.[A-Za-z0-9_-]+$/);
  assert.equal(result.title, "Pride and Prejudice");
  assert.match(result.url, /^https:\/\/libreleaf-books\.netlify\.app\/\?/);
  assert.deepEqual(JSON.parse(searchPayload.result.content[0].text), searchPayload.result.structuredContent);

  const fetchResponse = await mcpRequest({
    jsonrpc: "2.0",
    id: 21,
    method: "tools/call",
    params: { name: "fetch", arguments: { id: result.id } },
  }, { searchHandler });
  const fetchPayload = await fetchResponse.json() as {
    result: {
      content: Array<{ type: string; text: string }>;
      structuredContent: {
        id: string;
        title: string;
        text: string;
        url: string;
        metadata: { routeCount: number; rightsRegion: string; partial: boolean };
      };
    };
  };
  assert.equal(fetchPayload.result.structuredContent.id, result.id);
  assert.equal(fetchPayload.result.structuredContent.title, "Pride and Prejudice");
  assert.match(fetchPayload.result.structuredContent.text, /Access routes:/);
  assert.match(fetchPayload.result.structuredContent.text, /source-jurisdiction-only/);
  assert.equal(fetchPayload.result.structuredContent.metadata.routeCount, 1);
  assert.equal(fetchPayload.result.structuredContent.metadata.rightsRegion, "GB");
  assert.equal(fetchPayload.result.structuredContent.metadata.partial, true);
  assert.deepEqual(JSON.parse(fetchPayload.result.content[0].text), fetchPayload.result.structuredContent);
  assert.deepEqual(requests, [
    { query: "Pride and Prejudice", by: "q" },
    { query: "pride and prejudice", by: "title" },
  ]);
});

test("resolve_access returns one canonical match, all offers, and an auditable ranking", async () => {
  const searchHandler = async (request: Request) => {
    const url = new URL(request.url);
    assert.equal(url.searchParams.get("q"), "Pride and Prejudice");
    assert.equal(url.searchParams.get("by"), "title");
    assert.equal(url.searchParams.get("region"), "US");

    const gutenbergOffer = {
      source: "Project Gutenberg",
      access: "download",
      label: "Download EPUB",
      format: "EPUB",
      url: "https://www.gutenberg.org/ebooks/1342.epub3.images",
      rights: {
        status: "source-assessed-public-domain",
        jurisdiction: "US",
        note: "Project Gutenberg marks this edition as public domain in the United States.",
        applicability: "verified",
      },
    };
    const libraryOffer = {
      source: "Open Library",
      access: "borrow",
      label: "Borrow from Open Library",
      url: "https://openlibrary.org/works/OL66554W",
    };
    const doabOffer = {
      source: "DOAB",
      access: "download",
      label: "Download PDF",
      format: "PDF",
      url: "https://library.oapen.org/bitstream/20.500.12657/1/book.pdf",
      rights: {
        status: "open-licence",
        jurisdiction: "Publisher-supplied open licence",
        note: "DOAB lists this edition under the linked licence.",
        licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
        applicability: "verified",
      },
    };

    return Response.json({
      books: [{
        id: "gutenberg-1342",
        title: "Pride and Prejudice",
        authors: ["Austen, Jane"],
        year: 1813,
        source: "Project Gutenberg + Open Library",
        access: "download",
        formats: [{ label: "EPUB", url: gutenbergOffer.url }],
        detailsUrl: "https://www.gutenberg.org/ebooks/1342",
        workKey: "/works/OL66554W",
        clusterConfidence: "exact",
        why: ["Exact normalized title and primary-author match across catalogue records."],
        offers: [gutenbergOffer, libraryOffer, doabOffer],
        sourceRecords: [{
          source: "Project Gutenberg",
          recordId: "1342",
          detailsUrl: "https://www.gutenberg.org/ebooks/1342",
          offers: [gutenbergOffer],
        }, {
          source: "Open Library",
          recordId: "/works/OL66554W",
          detailsUrl: "https://openlibrary.org/works/OL66554W",
          workKey: "/works/OL66554W",
          offers: [libraryOffer],
        }, {
          source: "DOAB",
          recordId: "20.500.12657/1",
          detailsUrl: "https://directory.doabooks.org/handle/20.500.12657/1",
          offers: [doabOffer],
        }],
      }, {
        id: "openlibrary-/works/OL123W",
        title: "Jane Austen: A Life",
        authors: ["Claire Tomalin"],
        source: "Open Library",
        access: "preview",
        formats: [],
        detailsUrl: "https://openlibrary.org/works/OL123W",
        offers: [{
          source: "Open Library",
          access: "preview",
          label: "View on Open Library",
          url: "https://openlibrary.org/works/OL123W",
        }],
      }],
      sources: { gutenberg: "ok", openLibrary: "ok", wikisource: "exhausted", doab: "ok", libraryOfCongress: "exhausted" },
      rightsContext: {
        region: "US",
        label: "United States",
        note: "Source and licence context, not legal advice.",
      },
    });
  };

  const response = await mcpRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "resolve_access",
      arguments: { title: "Pride and Prejudice", author: "Jane Austen", region: "US" },
    },
  }, { searchHandler });
  const payload = await response.json() as {
    result: {
      isError?: boolean;
      structuredContent: {
        canonicalMatch: { title: string; sourceRecords?: unknown[] } | null;
        offers: Array<{ source: string; rights?: { applicability?: string } }>;
        ranking: { quality: string; candidatesConsidered: number; explanation: string[] };
      };
    };
  };
  const result = payload.result.structuredContent;

  assert.equal(payload.result.isError, undefined);
  assert.equal(result.canonicalMatch?.title, "Pride and Prejudice");
  assert.equal(result.ranking.quality, "exact");
  assert.equal(result.ranking.candidatesConsidered, 2);
  assert.match(result.ranking.explanation.join(" "), /Exact normalized author match/);
  assert.deepEqual(result.offers.map((offer) => offer.source), ["Project Gutenberg", "Open Library", "DOAB"]);
  assert.equal(result.offers[0]?.rights?.applicability, "verified");
  assert.equal(result.canonicalMatch?.sourceRecords?.length, 3);
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
    if (url.hostname === "www.loc.gov") return Response.json({ pagination: { current: 1, total: 1, of: 0 }, results: [] });
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
  assert.equal(fetchCount, 5);
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

  const resolveResponse = await mcpRequest({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "resolve_access",
      arguments: { title: "", author: "Jane Austen", region: "GB" },
    },
  });
  const resolvePayload = await resolveResponse.json() as { result: { isError?: boolean } };
  assert.equal(resolvePayload.result.isError, true);

  const fetchResponse = await mcpRequest({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "fetch",
      arguments: { id: "not-a-libreleaf-work" },
    },
  });
  const fetchPayload = await fetchResponse.json() as { result: { isError?: boolean } };
  assert.equal(fetchPayload.result.isError, true);
});

test("answers CORS preflight without creating a session", async () => {
  const response = await handleMcpRequest(new Request("https://libreleaf.example/mcp", {
    method: "OPTIONS",
  }));
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);
});
