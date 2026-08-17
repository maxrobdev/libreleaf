import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getTechnicalDoc, technicalDocs } from "../content/technical-docs";

const requiredSlugs = ["api", "mcp", "resolver", "source-rights", "resolver-index", "libresend", "briefleaf"];

test("technical documentation has distinct crawlable reference pages", () => {
  assert.deepEqual(technicalDocs.map((document) => document.slug), requiredSlugs);
  assert.equal(new Set(technicalDocs.map((document) => document.title)).size, technicalDocs.length);
  assert.equal(new Set(technicalDocs.map((document) => document.description)).size, technicalDocs.length);

  for (const document of technicalDocs) {
    assert.match(document.slug, /^[a-z][a-z-]+$/);
    assert.equal(document.updated, "2026-08-17");
    assert.ok(document.description.length >= 90);
    assert.ok(document.sections.length >= 4);
    assert.ok(document.references.length >= 3);
    const text = JSON.stringify(document);
    assert.doesNotMatch(text, /YOUR-|TODO|coming soon|guaranteed.{0,20}(?:SEO|ChatGPT|ranking)/i);
    for (const related of document.related) assert.ok(getTechnicalDoc(related), `${document.slug} links to missing ${related}`);
  }
});

test("technical documentation records current production boundaries", () => {
  const api = JSON.stringify(getTechnicalDoc("api"));
  assert.match(api, /\/api\/v1\/search/);
  assert.match(api, /nextCursor/);
  assert.match(api, /six catalogues/i);

  const mcp = JSON.stringify(getTechnicalDoc("mcp"));
  for (const tool of ["search(query)", "fetch(id)", "search_books", "resolve_access"]) assert.match(mcp, new RegExp(tool.replace(/[()]/g, "\\$&")));
  assert.match(mcp, /Streamable HTTP/);
  assert.match(mcp, /does not guarantee/i);

  const rights = JSON.stringify(getTechnicalDoc("source-rights"));
  for (const source of ["Project Gutenberg", "Open Library", "Wikisource", "DOAB", "Library of Congress", "LibriVox"]) assert.match(rights, new RegExp(source));
  assert.match(rights, /US-based/);

  const index = JSON.stringify(getTechnicalDoc("resolver-index"));
  assert.match(index, /not (?:yet )?production-primary/i);
  assert.match(index, /weekly CSV importer/i);

  const send = JSON.stringify(getTechnicalDoc("libresend"));
  assert.match(send, /does not operate a file relay/i);
});

test("OpenAPI and machine-readable documentation match the six-source v1 surface", async () => {
  const openApi = JSON.parse(await readFile(new URL("../public/openapi.json", import.meta.url), "utf8"));
  assert.equal(openApi.openapi, "3.1.0");
  assert.deepEqual(Object.keys(openApi.paths), ["/api/v1/search", "/api/v1/works/{workId}", "/api/v1/editions", "/api/v1/lists"]);
  assert.deepEqual(openApi.components.schemas.SourceName.enum, ["Project Gutenberg", "Open Library", "Wikisource", "DOAB", "Library of Congress", "LibriVox"]);
  for (const field of ["sourceHealth", "searchTiming", "ranking"]) assert.ok(openApi.components.schemas.SearchResponse.required.includes(field));

  const short = await readFile(new URL("../public/llms.txt", import.meta.url), "utf8");
  const full = await readFile(new URL("../public/llms-full.txt", import.meta.url), "utf8");
  for (const slug of requiredSlugs) assert.match(short, new RegExp(`https://libreleaf-books\\.netlify\\.app/docs/${slug}/`));
  assert.match(short, /does not guarantee|not yet/i);
  assert.match(full, /The index is not production-primary yet/);
  assert.match(full, /public LibreLeaf deployment does not operate a relay/i);
});
