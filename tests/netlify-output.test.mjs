import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const documents = ["api", "mcp", "resolver", "source-rights", "resolver-index", "libresend", "briefleaf"];

test("built technical pages contain semantic content without client rendering", async () => {
  const hub = await readFile(new URL("../dist/netlify/docs/index.html", import.meta.url), "utf8");
  assert.match(hub, /<h1>Technical reference\.<\/h1>/);
  for (const slug of documents) assert.match(hub, new RegExp(`href="/docs/${slug}/"`));

  for (const slug of documents) {
    const page = await readFile(new URL(`../dist/netlify/docs/${slug}/index.html`, import.meta.url), "utf8");
    assert.match(page, /<meta name="robots" content="index, follow" \/>/);
    assert.match(page, new RegExp(`rel="canonical" href="https://libreleaf-books\\.netlify\\.app/docs/${slug}/"`));
    assert.match(page, /<article>/);
    assert.ok((page.match(/<section>/g) ?? []).length >= 5);
    assert.match(page, /"@type":"TechArticle"/);
  }
});

test("machine-readable docs are copied into the production output", async () => {
  for (const file of ["llms.txt", "llms-full.txt", "openapi.json", "robots.txt", "sitemap.xml"]) {
    const body = await readFile(new URL(`../dist/netlify/${file}`, import.meta.url), "utf8");
    assert.ok(body.length > 100, `${file} is unexpectedly short`);
  }
});
