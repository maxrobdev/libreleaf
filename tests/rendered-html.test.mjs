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
  assert.match(html, /SearchResultsPage/i);
  assert.match(html, /application\/ld\+json/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("uses one search-first interface for home and results", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../components/BookCard.tsx", import.meta.url), "utf8");
  const results = await readFile(new URL("../components/SearchResultsPage.tsx", import.meta.url), "utf8");

  assert.match(page, /<SearchResultsPage \/>/);
  assert.match(results, /Find an open book/);
  assert.match(results, /function homePayload/);
  assert.match(results, /FEATURED_BOOKS/);
  assert.match(results, /window\.history\.pushState\(\{\}, "", suffix \? `\/\?\$\{suffix\}` : "\/"\)/);
  assert.match(results, /SEARCH_FIELD_OPTIONS/);
  assert.match(results, /Search options:/);
  assert.match(results, /window\.addEventListener\("pointerdown", closeSearchOptions\)/);
  assert.match(card, /const cardRoutes/);
  assert.match(card, /route\.access === "download" \? "Download"/);
  assert.match(card, /Borrow this book/);
  assert.match(card, /View preview/);
  assert.match(card, /Why this result/);
  assert.match(card, /Source and ranking/);
  assert.match(card, /book-title-trigger/);
  assert.match(card, /closeOnEscape/);
  assert.match(card, /Library of Congress/);
  assert.match(card, /LibriVox/);
  assert.match(card, /Load editions/);
  assert.match(card, /Permanent work link/);
  assert.match(card, /Show all \$\{routes\.length\} routes/);
  assert.match(card, /US law/);
  assert.match(results, /RESULTS_BATCH_SIZE = 24/);
  assert.match(results, /function apiSearchMode/);
  assert.match(results, /by: apiSearchMode\(location\.by\)/);
  assert.match(results, /by=\$\{apiSearchMode\(location\.by\)\}/);
  const searchCss = await readFile(new URL("../components/SearchResultsPage.module.css", import.meta.url), "utf8");
  assert.match(searchCss, /\.submitSearch \{[^}]*width: 30px;[^}]*min-height: 30px/);
  assert.match(searchCss, /\.searchOptionsPopover \{[^}]*position: absolute;[^}]*opacity: 0/);
  assert.match(searchCss, /transition: opacity 140ms ease, transform 140ms ease/);
  assert.match(searchCss, /@media \(max-width: 720px\)[\s\S]*\.form input \{[^}]*font-size: 16px/);
  assert.match(results, /cursor: data\.nextCursor/);
  assert.match(results, /workId/);
  assert.match(results, /focused=\{Boolean\(location\.workId/);
  assert.match(results, /RRF_K = 60/);
  assert.match(results, /Load more/);
  assert.match(results, /Library of Congress/);
  assert.match(results, /LibriVox/);
  assert.match(results, />Listen </);
  assert.doesNotMatch(`${page}\n${card}\n${results}`, /Anna.?s Archive|LibGen|torrent/i);
});
