import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { GET, resetSearchReliabilityForTests } from "../app/api/search/route.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetSearchReliabilityForTests();
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

function emptyLibraryOfCongress() {
  return { pagination: { current: 1, total: 0, of: 0, next: null }, results: [] };
}

function emptyLibriVox() {
  return { books: [] };
}

function decodedCursor(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
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
    if (url.hostname === "www.loc.gov") return Response.json(emptyLibraryOfCongress());
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
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
  assert.equal(body.partial, false);
  assert.match(response.headers.get("cache-control") ?? "", /s-maxage=900/);
  assert.equal(body.books.length, 3);
  assert.equal(body.ranking.method, "rrf-v1");
  assert.equal(body.ranking.k, 60);
  assert.equal(body.books[0].title, "Pride and Prejudice");
  assert.equal(body.upstreamTotals.gutenberg, 80);
  assert.equal(body.upstreamTotals.openLibrary, 75);
  assert.equal(typeof body.nextCursor, "string");
  assert.equal(calls.length, 6);

  const merged = body.books.find((book: { title: string }) => book.title === "Pride and Prejudice");
  assert.equal(merged.clusterConfidence, "exact");
  assert.equal(merged.workKey, "/works/OL1W");
  assert.deepEqual(merged.sourceRecords.map((record: { source: string }) => record.source), ["Project Gutenberg", "Open Library"]);
  assert.equal(merged.offers.length, 3);
  assert.equal(merged.offers[0].rights.jurisdiction, "US");
  assert.match(merged.offers[0].rights.note, /United States/);
  assert.match(merged.why.at(-1), /Exact normalized title/);
  assert.match(merged.canonicalId, /^llw1\./);
  assert.match(merged.canonicalUrl, /\/\?.*work=llw1/);
  assert.equal(merged.ranking.method, "rrf-v1");
  assert.deepEqual(merged.ranking.sourceRanks, [
    { source: "Open Library", rank: 1 },
    { source: "Project Gutenberg", rank: 1 },
  ]);
  assert.match(merged.ranking.reasons.join(" "), /Confirmed by 2 independent catalogues/);
  assert.ok(merged.ranking.score > body.books.find((book: { title: string }) => book.title === "Persuasion").ranking.score);
  assert.equal(body.books.find((book: { title: string }) => book.title === "Emma").clusterConfidence, "probable");
});

test("uses reciprocal rank fusion to favour cross-catalogue consensus", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") {
      return Response.json({
        count: 2,
        next: null,
        results: [
          gutenbergBook(10, "Single-source result", "Writer, One"),
          gutenbergBook(11, "Consensus work", "Writer, Two"),
        ],
      });
    }
    if (url.hostname === "openlibrary.org") {
      return Response.json({
        numFound: 1,
        docs: [openLibraryBook("/works/OL11W", "Consensus work", "Writer Two")],
      });
    }
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    if (url.hostname === "www.loc.gov") return Response.json(emptyLibraryOfCongress());
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
    throw new Error(`Unexpected source ${url.hostname}`);
  };

  const response = await GET(new Request("https://libreleaf.test/api/search?q=reading"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.books[0].title, "Consensus work");
  assert.deepEqual(body.books[0].ranking.sourceRanks, [
    { source: "Open Library", rank: 1 },
    { source: "Project Gutenberg", rank: 2 },
  ]);
  assert.ok(body.books[0].ranking.score > body.books[1].ranking.score);
});

test("uses cursor offsets and ends pagination when both sources are exhausted", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") {
      return Response.json({ count: 33, next: "next", results: [gutenbergBook(1, "One", "Writer, A")] });
    }
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    if (url.hostname === "www.loc.gov") return Response.json(emptyLibraryOfCongress());
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
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
  assert.deepEqual(body.upstreamTotals, {
    gutenberg: 33,
    openLibrary: 33,
    wikisource: 0,
    doab: null,
    libraryOfCongress: 0,
    librivox: null,
  });
});

test("reports an Open Library timeout without an inline retry", async () => {
  let libraryCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") {
      return Response.json({ count: 1, next: null, results: [gutenbergBook(1, "One", "Writer, A")] });
    }
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    if (url.hostname === "www.loc.gov") return Response.json(emptyLibraryOfCongress());
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
    libraryCalls += 1;
    throw new DOMException("timed out", "TimeoutError");
  };
  const response = await GET(new Request("https://libreleaf.test/api/search?q=test"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(libraryCalls, 1);
  assert.equal(body.sources.openLibrary, "timeout");
  assert.equal(body.sourceHealth.openLibrary.attempted, true);
  assert.equal(body.sourceHealth.openLibrary.cache, "none");
  assert.ok(body.sourceHealth.openLibrary.durationMs <= body.searchTiming.firstResultsBudgetMs);
  assert.equal(decodedCursor(body.nextCursor).o, 0);
});

test("returns partial results and preserves a timed-out source for retry", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    if (url.hostname === "www.loc.gov") return Response.json(emptyLibraryOfCongress());
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
    if (url.hostname === "gutendex.com") {
      return Response.json({ count: 1, next: null, results: [gutenbergBook(1, "One", "Writer, A")] });
    }
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    if (url.hostname === "www.loc.gov") return Response.json(emptyLibraryOfCongress());
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
    throw new DOMException("timed out", "TimeoutError");
  };
  let response = await GET(new Request("https://libreleaf.test/api/search?q=test"));
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sources.openLibrary, "timeout");
  assert.equal(body.partial, true);
  assert.match(response.headers.get("cache-control") ?? "", /s-maxage=60/);
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

test("returns fast-source books when one source consumes the first-results budget", async () => {
  resetSearchReliabilityForTests(40);
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") {
      return Response.json({ count: 1, next: null, results: [gutenbergBook(1, "Fast result", "Writer, A")] });
    }
    if (url.hostname === "openlibrary.org") return Response.json({ numFound: 0, docs: [] });
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
    assert.equal(url.hostname, "www.loc.gov");
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) reject(signal.reason);
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  };

  const started = Date.now();
  const response = await GET(new Request("https://libreleaf.test/api/search?q=fast"));
  const elapsed = Date.now() - started;
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(elapsed < 500, `search took ${elapsed}ms`);
  assert.equal(body.books[0].title, "Fast result");
  assert.equal(body.sources.libraryOfCongress, "timeout");
  assert.equal(body.sourceHealth.libraryOfCongress.durationMs, 40);
  assert.equal(body.searchTiming.firstResultsBudgetMs, 40);
  assert.equal(decodedCursor(body.nextCursor).l, 0);
});

test("serves an exact stale source page after failure without advancing that source cursor", async () => {
  const doabItem = {
    uuid: "doab-stale",
    name: "Cached Open Book",
    handle: "20.500.12854/stale",
    metadata: [
      { key: "dc.title", value: "Cached Open Book" },
      { key: "dc.contributor.author", value: "Writer, Cache" },
      { key: "dc.identifier.uri", value: "https://directory.doabooks.org/handle/20.500.12854/stale" },
    ],
    bitstreams: [],
  };
  let failDoab = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") return Response.json({ count: 0, next: null, results: [] });
    if (url.hostname === "openlibrary.org") return Response.json({ numFound: 0, docs: [] });
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "www.loc.gov") return Response.json(emptyLibraryOfCongress());
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
    if (failDoab) throw new DOMException("timed out", "TimeoutError");
    return Response.json([doabItem]);
  };

  let response = await GET(new Request("https://libreleaf.test/api/search?q=cache-check"));
  assert.equal(response.status, 200);
  failDoab = true;
  response = await GET(new Request("https://libreleaf.test/api/search?q=cache-check"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.partial, true);
  assert.equal(body.sources.doab, "stale");
  assert.equal(body.sourceHealth.doab.cache, "stale");
  assert.equal(body.sourceHealth.doab.attempted, true);
  const cachedBook = body.books.find((book: { id: string }) => book.id === "doab-doab-stale");
  assert.equal(cachedBook.sourceRecords[0].source, "DOAB");
  assert.equal(decodedCursor(body.nextCursor).d, 0);
  assert.equal(decodedCursor(body.nextCursor).dd, false);
});

test("opens a short per-source circuit after repeated failures and preserves its cursor", async () => {
  let doabCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") return Response.json({ count: 0, next: null, results: [] });
    if (url.hostname === "openlibrary.org") return Response.json({ numFound: 0, docs: [] });
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "www.loc.gov") return Response.json(emptyLibraryOfCongress());
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
    doabCalls += 1;
    throw new DOMException("timed out", "TimeoutError");
  };

  await GET(new Request("https://libreleaf.test/api/search?q=circuit-check"));
  await GET(new Request("https://libreleaf.test/api/search?q=circuit-check"));
  const response = await GET(new Request("https://libreleaf.test/api/search?q=circuit-check"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(doabCalls, 2);
  assert.equal(body.sources.doab, "deferred");
  assert.equal(body.sourceHealth.doab.attempted, false);
  assert.equal(body.sourceHealth.doab.circuit, "open");
  assert.equal(decodedCursor(body.nextCursor).d, 0);
});

test("returns the unchanged cursor when every source fails", async () => {
  globalThis.fetch = async () => {
    throw new DOMException("timed out", "TimeoutError");
  };
  const response = await GET(new Request("https://libreleaf.test/api/search?q=all-down"));
  const body = await response.json();
  const cursor = decodedCursor(body.nextCursor);

  assert.equal(response.status, 502);
  assert.deepEqual(
    { g: cursor.g, o: cursor.o, w: cursor.w, d: cursor.d, l: cursor.l, a: cursor.a },
    { g: 1, o: 0, w: 0, d: 0, l: 0, a: 0 },
  );
  assert.equal(Object.values(body.sourceHealth).every((source: unknown) => (source as { attempted: boolean }).attempted), true);
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
    if (url.hostname === "www.loc.gov") return Response.json(emptyLibraryOfCongress());
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
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

test("adds paged Library of Congress access without inferring public-domain status", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") return Response.json({ count: 0, next: null, results: [] });
    if (url.hostname === "openlibrary.org") return Response.json({ numFound: 0, docs: [] });
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
    assert.equal(url.hostname, "www.loc.gov");
    assert.equal(url.pathname, "/books/");
    assert.equal(url.searchParams.get("fa"), "digitized:true|access-restricted:false");
    assert.equal(url.searchParams.get("at"), "pagination,results");
    assert.equal(url.searchParams.get("c"), "20");
    assert.equal(url.searchParams.get("sp"), "1");
    return Response.json({
      pagination: { current: 1, total: 2, of: 21, next: "https://www.loc.gov/books/?sp=2" },
      results: [{
        id: "http://www.loc.gov/item/53051218/",
        url: "https://www.loc.gov/item/53051218/",
        title: "Frankenstein; or, The modern Prometheus.",
        contributor: ["shelley, mary wollstonecraft"],
        date: "1818",
        language: ["english"],
        access_restricted: false,
        digitized: true,
        image_url: ["https://tile.loc.gov/image-services/frankenstein.jpg"],
        rights_advisory: ["Rights assessment not supplied for every country."],
        resources: [{
          caption: "Page view volume 1",
          pdf: "https://tile.loc.gov/storage-services/frankenstein.pdf",
          url: "https://www.loc.gov/resource/frankenstein/",
        }, { pdf: "https://example.com/not-a-library-file.pdf" }],
      }],
    });
  };

  let response = await GET(new Request("https://libreleaf.test/api/search?q=frankenstein&region=GB"));
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sources.libraryOfCongress, "ok");
  assert.equal(body.upstreamTotals.libraryOfCongress, 21);
  assert.equal(typeof body.nextCursor, "string");
  const book = body.books[0];
  assert.equal(book.source, "Library of Congress");
  assert.equal(book.year, 1818);
  assert.equal(book.offers.length, 2);
  assert.equal(book.offers[0].access, "download");
  assert.equal(book.offers[0].format, "PDF");
  assert.equal(book.offers[0].rights.status, "source-provided-access");
  assert.equal(book.offers[0].rights.applicability, "check-local");
  assert.match(book.offers[0].rights.note, /does not establish public-domain status in the UK/);

  const cursor = body.nextCursor;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "www.loc.gov");
    assert.equal(url.searchParams.get("sp"), "2");
    return Response.json({
      pagination: { current: 2, total: 2, of: 21, next: null },
      results: [{
        id: "https://www.loc.gov/item/restricted/",
        url: "https://www.loc.gov/item/restricted/",
        title: "Restricted item",
        access_restricted: true,
        digitized: true,
        resources: [{ pdf: "https://tile.loc.gov/storage-services/restricted.pdf" }],
      }],
    });
  };
  response = await GET(new Request(`https://libreleaf.test/api/search?q=frankenstein&region=GB&cursor=${encodeURIComponent(cursor)}`));
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.nextCursor, null);
  assert.equal(body.sources.libraryOfCongress, "ok");
  assert.equal(body.books.length, 0);
});

test("adds paged LibriVox listening routes with US-only source assessment", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") {
      return Response.json({ count: 1, next: null, results: [gutenbergBook(84, "Frankenstein", "Shelley, Mary Wollstonecraft")] });
    }
    if (url.hostname === "openlibrary.org") return Response.json({ numFound: 0, docs: [] });
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "directory.doabooks.org") return Response.json([]);
    if (url.hostname === "www.loc.gov") return Response.json(emptyLibraryOfCongress());
    assert.equal(url.hostname, "librivox.org");
    assert.equal(url.pathname, "/api/feed/audiobooks/");
    assert.equal(url.searchParams.get("title"), "Frankenstein");
    assert.equal(url.searchParams.get("offset"), "0");
    assert.equal(url.searchParams.get("limit"), "20");
    assert.match(url.searchParams.get("fields") ?? "", /url_librivox/);
    return Response.json({
      total: "21",
      books: [{
        id: "123",
        title: "Frankenstein",
        authors: [{ first_name: "Mary Wollstonecraft", last_name: "Shelley" }],
        language: "English",
        url_librivox: "http://librivox.org/frankenstein-by-mary-wollstonecraft-shelley/",
        url_rss: "https://librivox.org/rss/123",
        url_zip_file: "https://archive.org/download/frankenstein_librivox/frankenstein_64kb_mp3.zip",
        coverart_thumbnail: "https://archive.org/download/frankenstein_librivox/__ia_thumb.jpg",
      }],
    });
  };

  let response = await GET(new Request("https://libreleaf.test/api/search?q=Frankenstein&by=title&region=GB"));
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sources.librivox, "ok");
  assert.equal(body.upstreamTotals.librivox, 21);
  assert.equal(body.counts.listen, 1);
  assert.equal(typeof body.nextCursor, "string");
  const book = body.books.find((candidate: { title: string }) => candidate.title === "Frankenstein");
  assert.equal(book.clusterConfidence, "exact");
  assert.deepEqual(book.sourceRecords.map((record: { source: string }) => record.source), ["Project Gutenberg", "LibriVox"]);
  const listen = book.offers.find((offer: { source: string; access: string }) => offer.source === "LibriVox" && offer.access === "listen");
  assert.equal(listen.label, "Listen on LibriVox");
  assert.equal(listen.rights.status, "source-assessed-public-domain");
  assert.equal(listen.rights.applicability, "source-jurisdiction-only");
  assert.match(listen.rights.note, /Outside the US/);
  assert.equal(book.formats.some((format: { label: string }) => format.label === "MP3 ZIP"), true);

  const cursor = body.nextCursor;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "librivox.org");
    assert.equal(url.searchParams.get("offset"), "20");
    return Response.json({ total: "21", books: [] });
  };
  response = await GET(new Request(`https://libreleaf.test/api/search?q=Frankenstein&by=title&region=GB&cursor=${encodeURIComponent(cursor)}`));
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sources.librivox, "ok");
  assert.equal(body.nextCursor, null);
});

test("keeps the DOAB cursor unchanged after a timeout so it can be retried", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "gutendex.com") return Response.json({ count: 0, next: null, results: [] });
    if (url.hostname === "openlibrary.org") return Response.json({ numFound: 0, docs: [] });
    if (url.hostname === "en.wikisource.org") return Response.json(emptyWikisource());
    if (url.hostname === "www.loc.gov") return Response.json(emptyLibraryOfCongress());
    if (url.hostname === "librivox.org") return Response.json(emptyLibriVox());
    assert.equal(url.hostname, "directory.doabooks.org");
    throw new DOMException("timed out", "TimeoutError");
  };

  let response = await GET(new Request("https://libreleaf.test/api/search?q=open"));
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sources.doab, "timeout");
  assert.equal(typeof body.nextCursor, "string");

  const cursor = body.nextCursor;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "directory.doabooks.org");
    assert.equal(url.searchParams.get("offset"), "0");
    return Response.json([]);
  };
  response = await GET(new Request(`https://libreleaf.test/api/search?q=open&cursor=${encodeURIComponent(cursor)}`));
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sources.doab, "ok");
  assert.equal(body.nextCursor, null);
});
