import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GET as previewBrief } from "../app/api/brief/route.ts";
import { buildBriefEpub } from "../lib/brief/epub.ts";
import { parseBriefSelection } from "../lib/brief/request.ts";
import type { BriefFeed } from "../lib/brief/registry.ts";
import {
  aggregateBrief,
  aggregateBriefSelection,
  clearBriefCacheForTests,
  parseBriefFeed,
  type BriefPayload,
} from "../lib/brief/service.ts";

const fixtureFeed: BriefFeed = {
  id: "fixture-live",
  countries: ["GLOBAL"],
  topic: "top",
  name: "Fixture News",
  feedUrl: "https://feeds.example.test/news.xml",
  homepage: "https://news.example.test/",
  articleHosts: ["news.example.test"],
  termsUrl: "https://news.example.test/terms",
  language: "English",
};

const failedFeed: BriefFeed = {
  ...fixtureFeed,
  id: "fixture-failed",
  name: "Unavailable News",
  feedUrl: "https://failed.example.test/news.xml",
  homepage: "https://failed.example.test/",
  articleHosts: ["failed.example.test"],
  termsUrl: "https://failed.example.test/terms",
};

const rss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>Fixture</title>
  <item>
    <title><![CDATA[Safe & useful headline]]></title>
    <link>https://news.example.test/story/one?from=rss&amp;edition=uk</link>
    <pubDate>Sun, 16 Aug 2026 12:00:00 GMT</pubDate>
    <description><![CDATA[<p>A short feed summary.</p><script>alert('no')</script>]]></description>
    <content:encoded><![CDATA[<p>The publisher supplied this full RSS article.</p><p>A second paragraph remains readable.</p><script>alert('no')</script>]]></content:encoded>
  </item>
  <item><title>Untrusted link</title><link>https://attacker.test/story</link><description>Drop me.</description></item>
</channel></rss>`;

const guardianStyleRss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><item>
  <title>Publisher full-feed item</title>
  <link>https://news.example.test/story/full-feed</link>
  <description><![CDATA[<p>${"Publisher-supplied article sentence. ".repeat(90)}</p>]]></description>
  <media:content><media:credit>Photograph credit only</media:credit></media:content>
</item></channel></rss>`;

function read16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | bytes[offset + 1] << 8;
}

function read32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0;
}

function unzipStored(bytes: Uint8Array) {
  const files = new Map<string, { data: Uint8Array; method: number; extraLength: number }>();
  const decoder = new TextDecoder();
  let offset = 0;
  while (read32(bytes, offset) === 0x04034b50) {
    const method = read16(bytes, offset + 8);
    const compressedSize = read32(bytes, offset + 18);
    const nameLength = read16(bytes, offset + 26);
    const extraLength = read16(bytes, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    files.set(name, { data: bytes.slice(dataStart, dataStart + compressedSize), method, extraLength });
    offset = dataStart + compressedSize;
  }
  return { files, centralOffset: offset };
}

test("sanitises feed metadata and rejects article URLs outside the reviewed host", () => {
  const items = parseBriefFeed(rss, fixtureFeed);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Safe & useful headline");
  assert.equal(items[0].summary, "A short feed summary.");
  assert.equal(items[0].content, "The publisher supplied this full RSS article.\n\nA second paragraph remains readable.");
  assert.equal(items[0].url, "https://news.example.test/story/one?from=rss&edition=uk");
  assert.equal(items[0].publishedAt, "2026-08-16T12:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(items), /alert|script|attacker\.test/i);
});

test("prefers a substantive RSS description over media content metadata", () => {
  const [item] = parseBriefFeed(guardianStyleRss, fixtureFeed);
  assert.ok(item.content);
  assert.match(item.content, /Publisher-supplied article sentence/);
  assert.doesNotMatch(item.content, /Photograph credit/);
  assert.ok(item.content.length > (item.summary?.length ?? 0));
});

test("isolates one failed source and still returns a usable partial edition", async () => {
  clearBriefCacheForTests();
  const payload = await aggregateBrief("GLOBAL", "top", {
    registry: [fixtureFeed, failedFeed],
    now: () => new Date("2026-08-16T13:00:00Z"),
    fetchFeed: async (feed) => {
      if (feed.id === failedFeed.id) throw new Error("offline");
      return rss;
    },
  });
  assert.equal(payload.partial, true);
  assert.equal(payload.items.length, 1);
  assert.deepEqual(payload.sources.map((source) => source.state), ["live", "unavailable"]);
  assert.equal(payload.personalUseOnly, true);
});

test("caches a successful feed without refetching it", async () => {
  clearBriefCacheForTests();
  let calls = 0;
  const dependencies = {
    registry: [fixtureFeed],
    now: () => new Date("2026-08-16T13:00:00Z"),
    fetchFeed: async () => {
      calls += 1;
      return rss;
    },
  };
  await aggregateBrief("GLOBAL", "top", dependencies);
  const cached = await aggregateBrief("GLOBAL", "top", dependencies);
  assert.equal(calls, 1);
  assert.equal(cached.sources[0].state, "cached");
});

test("combines an explicit reviewed feed selection into one deduplicated edition", async () => {
  clearBriefCacheForTests();
  const secondFeed: BriefFeed = {
    ...fixtureFeed,
    id: "fixture-second",
    name: "Second Fixture",
    feedUrl: "https://feeds.example.test/second.xml",
  };
  const payload = await aggregateBriefSelection(
    { country: "GB", topic: "top", feedIds: [fixtureFeed.id, secondFeed.id] },
    {
      registry: [fixtureFeed, secondFeed],
      now: () => new Date("2026-08-16T13:00:00Z"),
      fetchFeed: async () => rss,
    },
  );
  assert.equal(payload.selectionMode, "feeds");
  assert.equal(payload.editionTitle, "Combined news · 2 feeds");
  assert.deepEqual(payload.feedIds, [fixtureFeed.id, secondFeed.id]);
  assert.equal(payload.sources.length, 2);
  assert.equal(payload.items.length, 1, "the same canonical article URL is included once");
});

test("interleaves selected publishers before applying the edition item cap", async () => {
  clearBriefCacheForTests();
  const secondFeed: BriefFeed = {
    ...fixtureFeed,
    id: "fixture-balanced",
    name: "Balanced Fixture",
    feedUrl: "https://feeds.example.test/balanced.xml",
  };
  const feedXml = (prefix: string) => `<?xml version="1.0"?><rss><channel>${Array.from({ length: 4 }, (_, index) => `
    <item><title>${prefix} ${index}</title><link>https://news.example.test/${prefix}/${index}</link><pubDate>Sun, 16 Aug 2026 ${12 - index}:00:00 GMT</pubDate><description>${prefix} summary</description></item>`).join("")}
  </channel></rss>`;
  const payload = await aggregateBriefSelection(
    { country: "GB", topic: "top", feedIds: [fixtureFeed.id, secondFeed.id] },
    {
      registry: [fixtureFeed, secondFeed],
      fetchFeed: async (feed) => feedXml(feed.id),
      now: () => new Date("2026-08-16T13:00:00Z"),
    },
  );
  assert.deepEqual(
    payload.items.slice(0, 6).map((item) => item.source.name),
    ["Fixture News", "Balanced Fixture", "Fixture News", "Balanced Fixture", "Fixture News", "Balanced Fixture"],
  );
});

test("accepts only bounded, reviewed feed identifiers in request URLs", () => {
  const selection = parseBriefSelection(new Request("https://libreleaf.test/api/brief?country=GB&topic=top&feed=bbc-top&feed=npr-top"));
  assert.deepEqual(selection.feedIds, ["bbc-top", "npr-top"]);
  assert.throws(
    () => parseBriefSelection(new Request("https://libreleaf.test/api/brief?country=GB&topic=top&feed=https%3A%2F%2Fevil.test%2Frss")),
    /Invalid reviewed feed selection/,
  );
});

test("builds a valid EPUB 3 container with publisher-supplied feed text", async () => {
  clearBriefCacheForTests();
  const payload = await aggregateBrief("GLOBAL", "top", {
    registry: [fixtureFeed],
    now: () => new Date("2026-08-16T13:00:00Z"),
    fetchFeed: async () => rss,
  });
  const epub = buildBriefEpub(payload as BriefPayload);
  const { files, centralOffset } = unzipStored(epub);
  const decoder = new TextDecoder();

  assert.equal(decoder.decode(files.get("mimetype")?.data), "application/epub+zip");
  assert.equal(files.get("mimetype")?.method, 0);
  assert.equal(files.get("mimetype")?.extraLength, 0);
  assert.deepEqual([...files.keys()], [
    "mimetype",
    "META-INF/container.xml",
    "EPUB/package.opf",
    "EPUB/nav.xhtml",
    "EPUB/brief.xhtml",
  ]);
  assert.equal(read32(epub, centralOffset), 0x02014b50);
  assert.ok(epub.some((_, index) => read32(epub, index) === 0x06054b50));

  const container = decoder.decode(files.get("META-INF/container.xml")?.data);
  const packageDocument = decoder.decode(files.get("EPUB/package.opf")?.data);
  const content = decoder.decode(files.get("EPUB/brief.xhtml")?.data);
  assert.match(container, /full-path="EPUB\/package\.opf"/);
  assert.match(packageDocument, /version="3\.0"/);
  assert.match(packageDocument, /properties="nav"/);
  assert.match(content, /Safe &amp; useful headline/);
  assert.match(content, /Fixture News/);
  assert.match(content, /publisher supplied this full RSS article/);
  assert.match(content, /second paragraph remains readable/);
  assert.match(content, /https:\/\/news\.example\.test\/story\/one\?from=rss&amp;edition=uk/);
  assert.doesNotMatch(content, /script|alert|attacker\.test/i);
});

test("rejects unsupported country/topic combinations before fetching", async () => {
  const response = await previewBrief(new Request("https://libreleaf.test/api/brief?country=AU&topic=technology"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "This country and topic combination is not available." });
});

test("browser reader filters full RSS text and exposes inline LibreSend handoff", async () => {
  const component = await readFile(new URL("../components/Briefleaf.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../components/Briefleaf.module.css", import.meta.url), "utf8");
  assert.match(component, /contentMode === "all" \|\| Boolean\(item\.content\)/);
  assert.match(component, /Full RSS text/);
  assert.match(component, /LibreSendLink/);
  assert.match(component, /readerItem\.content\.split/);
  assert.match(component, /Previous/);
  assert.match(component, /Next/);
  assert.match(component, /<details className=\{styles\.directory\}>/);
  assert.doesNotMatch(component, /<details className=\{styles\.directory\}\s+open/);
  assert.match(styles, /\.feedDirectory li \{ align-items: flex-start; flex-direction: column; \}/);
});
