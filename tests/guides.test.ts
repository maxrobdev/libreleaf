import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getGuide, guides, guideWordCount } from "../content/guides.ts";

test("publishes at least ten distinct substantive guides", () => {
  assert.ok(guides.length >= 10);
  assert.equal(new Set(guides.map((guide) => guide.slug)).size, guides.length);
  assert.equal(new Set(guides.map((guide) => guide.description)).size, guides.length);
  for (const guide of guides) {
    assert.match(guide.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(guideWordCount(guide) >= 280, `${guide.slug} is too short`);
    assert.ok(guide.sections.length >= 3);
    assert.ok(guide.references.length >= 2);
    assert.ok(guide.references.every((reference) => reference.url.startsWith("https://")));
    assert.ok(guide.related.every((slug) => Boolean(getGuide(slug))), `${guide.slug} has an unknown related guide`);
  }
});

test("covers device, rights, research, formats, API and MCP intents", () => {
  const slugs = new Set(guides.map((guide) => guide.slug));
  for (const expected of [
    "read-free-books-on-phone",
    "open-epub-on-android",
    "open-epub-on-iphone-ipad",
    "send-books-over-wifi-libresend",
    "send-ebook-to-kindle",
    "add-ebook-to-kobo",
    "use-calibre-open-books",
    "public-domain-uk-vs-us",
    "find-open-access-academic-books",
    "use-libreleaf-mcp",
    "use-libreleaf-api",
    "ebook-formats-epub-pdf-mobi-web",
    "verify-book-source-licence-edition",
  ]) assert.ok(slugs.has(expected), `missing ${expected}`);
});

test("renders Article and breadcrumb structured data", async () => {
  const component = await readFile(new URL("../components/Guides.tsx", import.meta.url), "utf8");
  assert.match(component, /"@type": "Article"/);
  assert.match(component, /"@type": "BreadcrumbList"/);
  assert.match(component, /mainEntityOfPage/);
  assert.match(component, /dateModified/);
});
