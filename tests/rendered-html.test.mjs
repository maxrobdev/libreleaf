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

test("server-renders the LibreLeaf search page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="en-GB"/i);
  assert.match(html, /LibreLeaf/i);
  assert.match(html, /Search open books/i);
  assert.match(html, /FREE &amp; OPEN BOOK SEARCH/i);
  assert.match(html, /application\/ld\+json/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps search empty by default and labels every route", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /useState\(""\)/);
  assert.match(page, /Download \{primary\.label\}/);
  assert.match(page, /Borrow this book/);
  assert.match(page, /View preview/);
  assert.match(page, /All formats/);
  assert.doesNotMatch(page, /Anna.?s Archive|LibGen|torrent/i);
});
