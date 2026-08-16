import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the LibreLeaf home page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="en-GB"/i);
  assert.match(html, /LibreLeaf/i);
  assert.match(html, /Find an open book/i);
  assert.match(html, /OPEN CATALOGUE RESOLVER/i);
  assert.match(html, /Project Gutenberg, Open Library, Wikisource, DOAB and the Library of Congress/i);
  assert.match(html, /application\/ld\+json/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps home search empty and routes results to a dedicated page", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../components/BookCard.tsx", import.meta.url), "utf8");
  const results = await readFile(new URL("../components/SearchResultsPage.tsx", import.meta.url), "utf8");

  assert.match(page, /action="\/search"/);
  assert.match(page, /name="q"/);
  assert.doesNotMatch(page, /name="q"[^>]*value=/);
  assert.match(card, /\{primary\.label\}/);
  assert.match(card, /Borrow this book/);
  assert.match(card, /View preview/);
  assert.match(card, /Why this result/);
  assert.match(card, /Source records/);
  assert.match(card, /Library of Congress/);
  assert.match(card, /Load editions/);
  assert.match(card, /Show all \$\{routes\.length\} routes/);
  assert.match(card, /US law/);
  assert.match(results, /RESULTS_BATCH_SIZE = 24/);
  assert.match(results, /cursor: data\.nextCursor/);
  assert.match(results, /Load more/);
  assert.match(results, /Library of Congress/);
  assert.doesNotMatch(`${page}\n${card}\n${results}`, /Anna.?s Archive|LibGen|torrent/i);
});
