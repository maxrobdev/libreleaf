import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GET, parseStandardEbooksFeed } from "../app/api/lists/route";
import { CURATED_LISTS } from "../components/curatedLists";

const atom = `<feed>
  <updated>2026-08-15T20:04:24Z</updated>
  <entry>
    <id>https://standardebooks.org/ebooks/test/book</id>
    <title>Test &amp; Book</title>
    <author><name>A. Writer</name></author>
    <published>2026-08-14T20:19:54Z</published>
    <rights>Public domain in the United States. Check local law elsewhere.</rights>
    <media:thumbnail url="https://example.com/cover.jpg"/>
    <link href="https://standardebooks.org/ebooks/test/book" rel="alternate" type="application/xhtml+xml"/>
    <link href="https://example.com/book.epub" rel="enclosure" type="application/epub+zip"/>
  </entry>
</feed>`;

test("parses the public Standard Ebooks release feed", () => {
  const list = parseStandardEbooksFeed(atom, "fallback");
  assert.equal(list.updatedAt, "2026-08-15T20:04:24Z");
  assert.equal(list.items[0]?.title, "Test & Book");
  assert.equal(list.items[0]?.actionUrl, "https://example.com/book.epub");
  assert.equal(list.items[0]?.rights.jurisdiction, "US");
});

test("returns useful partial lists when Open Library is unavailable", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("gutendex.com")) {
      return Response.json({ results: [{
        id: 1,
        title: "A Public Book",
        authors: [{ name: "A. Author" }],
        copyright: false,
        download_count: 123,
        formats: {
          "application/epub+zip": "https://www.gutenberg.org/ebooks/1.epub3.images",
          "image/jpeg": "https://www.gutenberg.org/cover.jpg",
        },
      }] });
    }
    if (url.includes("standardebooks.org")) return new Response(atom, { status: 200 });
    throw new Error("Open Library unavailable");
  };

  const response = await GET();
  const payload = await response.json();
  assert.equal(payload.partial, true);
  assert.equal(payload.lists.find((list: { id: string }) => list.id === "gutenberg-popular").state, "live");
  assert.equal(payload.lists.find((list: { id: string }) => list.id === "open-library-trending").state, "unavailable");
});

test("ships stable topic lists independently of live sources", () => {
  const required = ["classics", "strange-fiction", "nonfiction", "history", "philosophy", "science", "politics", "poetry", "children", "short-reads"];
  assert.deepEqual(required.filter((id) => !CURATED_LISTS.some((list) => list.id === id)), []);
  assert.ok(CURATED_LISTS.every((list) => list.books.length >= 6));
  assert.ok(CURATED_LISTS.length >= 20);
  assert.ok(CURATED_LISTS.reduce((total, list) => total + list.books.length, 0) >= 160);
  assert.equal(new Set(CURATED_LISTS.map((list) => list.id)).size, CURATED_LISTS.length);
});

test("routes the production lists feed before the SPA fallback", async () => {
  const config = await readFile(new URL("../netlify.toml", import.meta.url), "utf8");
  const listsRoute = config.indexOf('from = "/api/lists"');
  const spaFallback = config.indexOf('from = "/*"');
  assert.ok(listsRoute >= 0);
  assert.ok(spaFallback > listsRoute);
});

test("keeps list sections collapsed and mobile grids dense", async () => {
  const page = await readFile(new URL("../components/ListsPage.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../components/ListsPage.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(page, /<details[^>]*\sopen(?:\s|=|>)/);
  assert.match(page, /<summary>[\s\S]*\{book\.title\}[\s\S]*<\/summary>/);
  assert.match(page, /resolveCuratedBook/);
  assert.match(page, /RESOLVER_CACHE_KEY/);
  assert.match(page, /onToggle=/);
  assert.doesNotMatch(page, />Resolve access</);
  assert.match(css, /\.topicGrid\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,/);
  assert.match(css, /\.topicGrid\s*\{\s*grid-template-columns:\s*repeat\(2,/);
  assert.match(css, /\.grid\s*\{\s*grid-template-columns:\s*repeat\(2,/);
});
