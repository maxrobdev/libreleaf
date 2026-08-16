import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { GET, isValidWorkKey, normaliseEdition } from "../app/api/editions/route.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("accepts only canonical Open Library work keys", async () => {
  assert.equal(isValidWorkKey("/works/OL45804W"), true);
  assert.equal(isValidWorkKey("/books/OL45804M"), false);
  assert.equal(isValidWorkKey("https://openlibrary.org/works/OL45804W"), false);
  assert.equal(isValidWorkKey("/works/ol45804w"), false);
  assert.equal(isValidWorkKey("/works/OL0W"), false);

  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({});
  };
  for (const query of ["", "?workKey=/books/OL1M", "?workKey=/works/OL1W&workKey=/works/OL2W", "?workKey=../../private"]) {
    const response = await GET(new Request(`https://libreleaf.test/api/editions${query}`));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  assert.equal(called, false);
});

test("normalises edition metadata, access checks and record provenance without asserting rights", () => {
  const edition = normaliseEdition({
    key: "/books/OL7353617M",
    title: "Frankenstein",
    publish_date: "September 1, 2008",
    languages: [{ key: "/languages/eng" }, { key: "/languages/fre" }, { key: "/bad/not-a-language" }],
    isbn_10: ["0-14-143947-5", "not-an-isbn"],
    isbn_13: ["978-0-14-143947-1", "123"],
    publishers: ["Penguin Classics", "Penguin Classics"],
    physical_format: "Paperback",
    number_of_pages: 273,
    ocaid: "frankenstein00shel_0",
    ia: ["frankenstein00shel_0", "another_item", "https://unsafe.test"],
  }, "/works/OL450063W");

  assert.ok(edition);
  assert.equal(edition.publishYear, 2008);
  assert.deepEqual(edition.languages, [{ code: "eng", name: "English" }, { code: "fre", name: "French" }]);
  assert.deepEqual(edition.isbn10, ["0141439475"]);
  assert.deepEqual(edition.isbn13, ["9780141439471"]);
  assert.deepEqual(edition.publishers, ["Penguin Classics"]);
  assert.equal(edition.numberOfPages, 273);
  assert.deepEqual(edition.accessLinks.map((link) => link.url), [
    "https://openlibrary.org/books/OL7353617M",
    "https://archive.org/details/frankenstein00shel_0",
    "https://archive.org/details/another_item",
  ]);
  assert.ok(edition.accessLinks.every((link) => link.availability === "not-checked"));
  assert.equal(edition.rights.status, "not-assessed");
  assert.match(edition.rights.note, /has not assessed rights/);
  assert.deepEqual(edition.provenance, {
    source: "Open Library",
    workKey: "/works/OL450063W",
    editionKey: "/books/OL7353617M",
    recordUrl: "https://openlibrary.org/books/OL7353617M",
    apiRecordUrl: "https://openlibrary.org/books/OL7353617M.json",
  });
});

test("fetches a bounded edition page only when requested and returns cacheable provenance", async () => {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    assert.equal(String(input), "https://openlibrary.org/works/OL45804W/editions.json?limit=12");
    assert.equal((init?.headers as Record<string, string>).Accept, "application/json");
    assert.equal((init?.headers as Record<string, string>)["User-Agent"], "LibreLeaf/0.1 (+https://github.com/maxrobdev/libreleaf)");
    return Response.json({
      size: 20,
      entries: Array.from({ length: 14 }, (_, index) => ({
        key: `/books/OL${index + 1}M`,
        title: `Edition ${index + 1}`,
        publish_date: index === 0 ? "1818" : undefined,
        languages: [{ key: "/languages/eng" }],
      })),
    });
  };

  const response = await GET(new Request("https://libreleaf.test/api/editions?workKey=%2Fworks%2FOL45804W"));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(payload.editions.length, 12);
  assert.equal(payload.returned, 12);
  assert.equal(payload.total, 20);
  assert.equal(payload.partial, true);
  assert.equal(payload.limit, 12);
  assert.equal(payload.editions[0].publishYear, 1818);
  assert.equal(payload.provenance.workUrl, "https://openlibrary.org/works/OL45804W");
  assert.equal(payload.provenance.editionsApiUrl, "https://openlibrary.org/works/OL45804W/editions.json?limit=12");
  assert.match(response.headers.get("Cache-Control") ?? "", /s-maxage=86400/);
  assert.match(response.headers.get("Netlify-CDN-Cache-Control") ?? "", /durable/);
});

test("distinguishes not-found, throttled, timed-out and malformed upstream responses", async () => {
  const cases: Array<[number | "timeout" | "malformed", number, string]> = [
    [404, 404, "work_not_found"],
    [429, 503, "source_rate_limited"],
    [500, 502, "source_unavailable"],
    ["timeout", 504, "source_timeout"],
    ["malformed", 502, "invalid_upstream_response"],
  ];

  for (const [upstream, status, code] of cases) {
    globalThis.fetch = async () => {
      if (upstream === "timeout") throw new DOMException("timed out", "TimeoutError");
      if (upstream === "malformed") return Response.json({ entries: "not-an-array" });
      return new Response(null, { status: upstream });
    };
    const response = await GET(new Request("https://libreleaf.test/api/editions?workKey=%2Fworks%2FOL45804W"));
    const payload = await response.json();
    assert.equal(response.status, status);
    assert.equal(payload.error, code);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});
