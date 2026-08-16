import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { GET } from "../app/api/search/route.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function gutenbergBook(id: number, title: string, author: string) {
  return {
    id,
    title,
    authors: [{ name: author }],
    formats: {
      "application/epub+zip": `https://www.gutenberg.org/ebooks/${id}.epub3.images`,
      "text/html; charset=us-ascii": `https://www.gutenberg.org/ebooks/${id}.html.images`,
      "application/pdf": "https://example.com/rejected.pdf",
      "image/jpeg": `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
    },
  };
}

function openLibraryBook(key: string, title: string, author: string, access = "borrowable") {
  return {
    key,
    title,
    author_name: [author],
    first_publish_year: 1813,
    cover_i: 123,
    ebook_access: access,
  };
}

function emptyWikisource() {
  return { batchcomplete: true, query: { searchinfo: { totalhits: 0 }, pages: [] } };
}

test("returns work provenance, exact clusters, totals and a progressive cursor", async () => {
  const calls: URL[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.hostname === "gutendex.com") {
      assert.equal(url.searchParams.get("page"), "1");
      return Response.json({
        count: 80,
        next: "https://gutendex.com/books?page=2",
        results: [
          gutenbergBook(1, "Pride and Prejudice", "Austen, Jane"),
          gutenbergBook(2, "Persuasion", "Austen, Jane"),
        ],
      });
    }
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    assert.equal(url.searchParams.get("offset"), "0");
    assert.equal(url.searchParams.get("limit"), "32");
    assert.equal(
      String((init?.headers as Record<string, string>)["User-Agent"]),
      "LibreLeaf/0.1 (+https://github.com/maxrobdev/libreleaf)",
    );
    return Response.json({
      numFound: 75,
      docs: [
        openLibraryBook("/works/OL1W", "Pride and Prejudice", "Jane Austen"),
        openLibraryBook("/works/OL2W", "Emma", "Jane Austen", "no_ebook"),
      ],
    });
  };

  const response = await GET(new Request("https://libreleaf.test/api/search?q=austen&by=author"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.books.length, 3);
  assert.equal(body.upstreamTotals.gutenberg, 80);
  assert.equal(body.upstreamTotals.openLibrary, 75);
  assert.equal(typeof body.nextCursor, "string");
  assert.equal(calls.length, 4);

  const merged = body.books.find((book: { title: string }) => book.title === "Pride and Prejudice");
  assert.equal(merged.clusterConfidence, "exact");
  assert.equal(merged.workKey, "/works/OL1W");
  assert.deepEqual(merged.sourceRecords.map((record: { source: string }) => record.source), ["Project Gutenberg", "Open Library"]);
  assert.equal(merged.offers.length, 3);
  assert.equal(merged.offers[0].rights.jurisdiction, "US");
  assert.match(merged.offers[0].rights.note, /United States/);
  assert.match(merged.why.at(-1), /Exact normalized title/);
  assert.equal(body.books.find((book: { title: string }) => book.title === "Emma").clusterConfidence, "probable");
});

test("uses cursor offsets and ends pagination when both sources are exhausted", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") {
      return Response.json({ count: 33, next: "next", results: [gutenbergBook(1, "One", "Writer, A")] });
    }
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    return Response.json({ numFound: 33, docs: [openLibraryBook("/works/OL1W", "Other", "Writer B")] });
  };
  let response = await GET(new Request("https://libreleaf.test/api/search?q=test"));
  const nextCursor: string = (await response.json()).nextCursor;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") {
      assert.equal(url.searchParams.get("page"), "2");
      return Response.json({ count: 33, next: null, results: [gutenbergBook(3, "Last", "Writer, C")] });
    }
    assert.equal(url.searchParams.get("offset"), "32");
    return Response.json({ numFound: 33, docs: [openLibraryBook("/works/OL3W", "Final", "Writer D")] });
  };
  response = await GET(new Request(`https://libreleaf.test/api/search?q=test&cursor=${encodeURIComponent(nextCursor)}`));
  const body = await response.json();
  assert.equal(body.nextCursor, null);
  assert.deepEqual(body.upstreamTotals, { gutenberg: 33, openLibrary: 33, wikisource: 0, doab: null });
});

test("retries transient Open Library failures with a smaller page and advances by that page", async () => {
  let libraryCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") {
      return Response.json({ count: 1, next: null, results: [gutenbergBook(1, "One", "Writer, A")] });
    }
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    libraryCalls += 1;
    if (libraryCalls === 1) throw new DOMException("timed out", "TimeoutError");
    assert.equal(url.searchParams.get("limit"), "16");
    return Response.json({ numFound: 40, docs: [openLibraryBook("/works/OL1W", "Other", "Writer B")] });
  };
  let response = await GET(new Request("https://libreleaf.test/api/search?q=test"));
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(libraryCalls, 2);
  assert.equal(body.sources.openLibrary, "ok");

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "openlibrary.org");
    assert.equal(url.searchParams.get("offset"), "16");
    return Response.json({ numFound: 17, docs: [openLibraryBook("/works/OL2W", "Last", "Writer C")] });
  };
  response = await GET(new Request(`https://libreleaf.test/api/search?q=test&cursor=${encodeURIComponent(body.nextCursor)}`));
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.nextCursor, null);
});

test("returns partial results and preserves a timed-out source for retry", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    if (url.hostname === "gutendex.com") {
      return Response.json({ count: 1, next: null, results: [gutenbergBook(1, "One", "Writer, A")] });
    }
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    throw new DOMException("timed out", "TimeoutError");
  };
  let response = await GET(new Request("https://libreleaf.test/api/search?q=test"));
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sources.openLibrary, "timeout");
  assert.equal(body.books.length, 1);

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "openlibrary.org");
    assert.equal(url.searchParams.get("offset"), "0");
    return Response.json({ numFound: 0, docs: [] });
  };
  response = await GET(new Request(`https://libreleaf.test/api/search?q=test&cursor=${encodeURIComponent(body.nextCursor)}`));
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.nextCursor, null);
});

test("rejects malformed cursors without calling upstreams", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({});
  };
  const response = await GET(new Request("https://libreleaf.test/api/search?q=test&cursor=not-json"));
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("adds Wikisource and DOAB routes with language, licence and selected rights context", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") {
      return Response.json({ count: 1, next: null, results: [gutenbergBook(1342, "Pride and Prejudice", "Austen, Jane")] });
    }
    if (url.hostname === "openlibrary.org") return Response.json({ numFound: 0, docs: [] });
    if (url.hostname === "en.wikisource.org") {
      assert.equal(url.searchParams.get("gsroffset"), "0");
      return Response.json({
        batchcomplete: true,
        query: {
          searchinfo: { totalhits: 1 },
          pages: [{ pageid: 942, ns: 0, title: "Pride and Prejudice (1817)", pagelanguage: "en", fullurl: "https://en.wikisource.org/wiki/Pride_and_Prejudice_(1817)" }],
        },
      });
    }
    if (url.hostname === "directory.doabooks.org") {
      assert.equal(url.searchParams.get("offset"), "0");
      return Response.json([{
        uuid: "doab-1",
        name: "Open Scholarship",
        handle: "20.500.12854/1",
        metadata: [
          { key: "dc.title", value: "Open Scholarship" },
          { key: "dc.contributor.author", value: "Author, Ada" },
          { key: "dc.language", value: "French", code: "fra" },
          { key: "publisher.country", value: "France" },
          { key: "dc.identifier.uri", value: "https://directory.doabooks.org/handle/20.500.12854/1" },
          { key: "dc.rights.uri", value: "https://creativecommons.org/licenses/by/4.0/" },
        ],
        bitstreams: [],
      }]);
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const response = await GET(new Request("https://libreleaf.test/api/search?q=open&region=GB"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.rightsContext.region, "GB");
  assert.equal(body.sources.wikisource, "ok");
  assert.equal(body.sources.doab, "ok");

  const wiki = body.books.find((book: { source: string }) => book.source === "Wikisource");
  assert.equal(wiki.language, "English");
  assert.equal(wiki.offers[0].access, "read");
  assert.equal(wiki.offers[0].rights.applicability, "check-local");

  const doab = body.books.find((book: { source: string }) => book.source === "DOAB");
  assert.equal(doab.language, "French");
  assert.equal(doab.country, "France");
  assert.equal(doab.offers[0].access, "read");
  assert.equal(doab.offers[0].rights.applicability, "verified");

  const gutenberg = body.books.find((book: { source: string }) => book.source === "Project Gutenberg");
  assert.equal(gutenberg.offers[0].rights.applicability, "source-jurisdiction-only");
});
