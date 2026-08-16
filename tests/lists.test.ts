import assert from "node:assert/strict";
import test from "node:test";
import { GET, parseStandardEbooksFeed } from "../app/api/lists/route";

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
