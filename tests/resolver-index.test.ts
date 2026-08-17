import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseIndexNdjson, ResolverIndex, validateIndexEntry } from "../lib/resolver-index/database.ts";
import { resolveIndexHttpRequest } from "../lib/resolver-index/server.ts";
import { buildResolverSnapshot } from "../lib/resolver-index/snapshot.ts";
import { generateGutenbergCsvEntries, type GutenbergCsvReport } from "../lib/resolver-index/importers/gutenberg-csv.ts";
import type { ResolverIndexEntry } from "../lib/resolver-index/types.ts";

const fixtureText = readFileSync(new URL("../fixtures/resolver-index/sample.ndjson", import.meta.url), "utf8");
const fixtureEntries = parseIndexNdjson(fixtureText);

function freshIndex() {
  return new ResolverIndex(":memory:");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function collectGutenberg(csv: string, maxRecords?: number) {
  const iterator = generateGutenbergCsvEntries(csv, {
    fetchedAt: "2026-08-17T17:38:00.000Z",
    ...(maxRecords ? { maxRecords } : {}),
  });
  const entries: ResolverIndexEntry[] = [];
  let next = iterator.next();
  while (!next.done) {
    entries.push(next.value);
    next = iterator.next();
  }
  return { entries, report: next.value as GutenbergCsvReport };
}

test("a clean index ingests fixtures and resolves one canonical multi-source work", () => {
  const index = freshIndex();
  try {
    const run = index.ingest(fixtureEntries, "checked-in-fixture");
    assert.equal(run.recordCount, 2);

    const result = index.search("Frankenstein", { region: "GB" });
    assert.equal(result.total, 1);
    assert.equal(result.books.length, 1);
    const [book] = result.books;
    assert.equal(book.clusterConfidence, "exact");
    assert.deepEqual(book.sourceRecords.map((record) => record.source), ["LibriVox", "Project Gutenberg"]);
    assert.deepEqual(book.offers.map((offer) => offer.access), ["listen", "download"]);
    assert.equal(book.offers.every((offer) => offer.rights?.jurisdiction === "United States"), true);
    assert.match(book.indexRanking.reasons.join(" "), /2 retained source records/);
    assert.equal(book.indexProvenance.length, 2);
    assert.equal(book.indexProvenance.every((record) => record.merge.method === "exact-title-primary-author"), true);
    assert.equal(book.indexProvenance.every((record) => record.merge.evidence.length === 2), true);
    assert.match(result.explanation, /SQLite FTS5 BM25/);

    const snapshot = index.exportSnapshot();
    assert.equal(snapshot.sourceRecords.length, 3);
    assert.equal(snapshot.offers.length, 3);
    assert.equal(snapshot.mergeDecisions.length, 3);
    const decisions = snapshot.mergeDecisions.filter((decision) => decision.canonical_id === book.canonicalId);
    assert.equal(decisions.length, 2);
    assert.equal(decisions.every((decision) => decision.method === "exact-title-primary-author"), true);
    assert.equal(decisions.every((decision) => String(decision.evidence_json).includes("mary wollstonecraft shelley")), true);
  } finally {
    index.close();
  }
});

test("subject terms are searchable without changing the work metadata", () => {
  const index = freshIndex();
  try {
    index.ingest(fixtureEntries, "checked-in-fixture");
    const result = index.search("mental health");
    assert.equal(result.total, 1);
    assert.equal(result.books[0]?.title, "The Yellow Wallpaper");
  } finally {
    index.close();
  }
});

test("older refreshes cannot erase newer source records", () => {
  const index = freshIndex();
  try {
    index.ingest(fixtureEntries, "newer-fixture");
    const older = clone(fixtureEntries[0]);
    older.fetchedAt = "2025-08-17T00:00:00.000Z";
    older.work.sourceRecords[0]!.offers[0]!.url = "https://www.gutenberg.org/older.epub";
    index.ingest([older], "older-fixture");

    const result = index.search("Frankenstein");
    assert.equal(result.books[0]?.offers.some((offer) => offer.url.endsWith("older.epub")), false);
    assert.equal(result.books[0]?.offers.some((offer) => offer.url.includes("84.epub3.images")), true);
    assert.equal(result.books[0]?.indexedAt, "2026-08-17T00:00:00.000Z");
  } finally {
    index.close();
  }
});

test("a newer source refresh replaces only that source's routes", () => {
  const index = freshIndex();
  try {
    index.ingest(fixtureEntries, "initial-fixture");
    const newer = clone(fixtureEntries[0]);
    newer.fetchedAt = "2026-08-18T00:00:00.000Z";
    newer.merge = {
      method: "single-source",
      algorithmVersion: "resolver-exact-v1",
      evidence: ["Project Gutenberg source refresh; no cross-source merge recomputed."],
    };
    newer.work.sourceRecords = [clone(newer.work.sourceRecords[0]!)];
    newer.work.sourceRecords[0]!.offers[0]!.url = "https://www.gutenberg.org/ebooks/84.epub.noimages";
    index.ingest([newer], "gutenberg-refresh");

    const [book] = index.search("Frankenstein").books;
    assert.equal(book.offers.some((offer) => offer.source === "LibriVox"), true);
    assert.equal(book.offers.some((offer) => offer.url.includes("84.epub.noimages")), true);
    assert.equal(book.offers.some((offer) => offer.url.includes("84.epub3.images")), false);
  } finally {
    index.close();
  }
});

test("failed refresh history keeps the last known searchable work", () => {
  const index = freshIndex();
  try {
    index.ingest(fixtureEntries, "initial-fixture");
    index.recordRefreshFailure("Open Library", "2026-08-18T00:00:00.000Z", "Upstream timeout");
    assert.equal(index.search("Frankenstein").total, 1);
    const failed = index.exportSnapshot().refreshRuns.find((run) => run.status === "failed");
    assert.equal(failed?.source_label, "Open Library");
    assert.equal(failed?.record_count, 0);
  } finally {
    index.close();
  }
});

test("validation is atomic and rejects unsafe routes", () => {
  const index = freshIndex();
  try {
    const unsafe = clone(fixtureEntries[0]);
    unsafe.work.sourceRecords[0]!.offers[0]!.url = "file:///etc/passwd";
    assert.throws(() => index.ingest([fixtureEntries[1], unsafe], "unsafe-fixture"), /HTTP or HTTPS/);
    assert.equal(index.exportSnapshot().works.length, 0);
    assert.throws(() => validateIndexEntry({ schemaVersion: 1 }), /fetchedAt|work/);
  } finally {
    index.close();
  }
});

test("JSON and CSV exports are deterministic and complete", () => {
  const first = freshIndex();
  const second = freshIndex();
  try {
    first.ingest(fixtureEntries, "checked-in-fixture");
    second.ingest(fixtureEntries, "checked-in-fixture");
    assert.equal(first.exportJson(), second.exportJson());
    const csv = first.exportCsv();
    assert.deepEqual(Object.keys(csv), [
      "works.csv",
      "source-records.csv",
      "offers.csv",
      "merge-decisions.csv",
      "refresh-runs.csv",
    ]);
    assert.match(csv["offers.csv"], /rights_status/);
    assert.match(csv["merge-decisions.csv"], /algorithm_version/);
    assert.match(csv["source-records.csv"], /fetched_at/);
  } finally {
    first.close();
    second.close();
  }
});

test("the self-hosted service exposes bounded read-only status and search", () => {
  const index = freshIndex();
  try {
    index.ingest(fixtureEntries, "checked-in-fixture");
    const status = resolveIndexHttpRequest(index, { method: "GET", url: "/v1/status" });
    assert.equal(status.status, 200);
    assert.equal((status.payload as Record<string, unknown>).works, 2);
    assert.equal((status.payload as Record<string, unknown>).activeOffers, 3);

    const search = resolveIndexHttpRequest(index, { method: "GET", url: "/v1/search?q=Frankenstein&region=GB&limit=1" });
    const payload = search.payload as { books: Array<{ sourceRecords: unknown[] }> };
    assert.equal(payload.books.length, 1);
    assert.equal(payload.books[0]?.sourceRecords.length, 2);
    assert.equal(resolveIndexHttpRequest(index, { method: "POST", url: "/v1/search" }).status, 405);
    assert.equal(resolveIndexHttpRequest(index, { method: "GET", url: "/v1/search?q=x&limit=999" }).status, 400);
  } finally {
    index.close();
  }
});

test("the snapshot builder pages to exhaustion and merges canonical records across queries", async () => {
  const full = clone(fixtureEntries[0].work);
  const gutenberg = { ...clone(full), sourceRecords: [clone(full.sourceRecords[0]!)], source: "Project Gutenberg" };
  const librivox = { ...clone(full), sourceRecords: [clone(full.sourceRecords[1]!)], source: "LibriVox" };
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    calls.push(url.toString());
    const query = url.searchParams.get("q");
    const cursor = url.searchParams.get("cursor");
    const value = query === "Frankenstein" && !cursor
      ? { books: [gutenberg], nextCursor: "page_two", sources: { gutenberg: "ok", librivox: "timeout" } }
      : query === "Frankenstein"
        ? { books: [librivox], nextCursor: null, sources: { gutenberg: "exhausted", librivox: "ok" } }
        : { books: [full], nextCursor: null, sources: { gutenberg: "ok", librivox: "ok" } };
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const result = await buildResolverSnapshot({
    endpoint: "https://resolver.example/api/v1/search",
    queries: [
      { query: "Frankenstein", by: "title" },
      { query: "gothic", by: "subject" },
    ],
    fetchedAt: "2026-08-17T12:00:00.000Z",
    maxPagesPerQuery: 10,
    fetcher,
  });
  assert.equal(calls.length, 3);
  assert.equal(result.report.complete, true);
  assert.equal(result.report.pagesFetched, 3);
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.entries[0]?.searchTerms, ["Frankenstein", "gothic"]);
  assert.deepEqual(result.entries[0]?.work.sourceRecords.map((record) => record.source), ["LibriVox", "Project Gutenberg"]);
  assert.equal(result.entries[0]?.merge.method, "resolver-exact-cluster");
});

test("the snapshot builder reports repeated cursors as incomplete", async () => {
  const book = clone(fixtureEntries[1].work);
  const fetcher = (async () => new Response(JSON.stringify({
    books: [book],
    nextCursor: "stuck_cursor",
    sources: { gutenberg: "timeout" },
  }), { status: 200 })) as typeof fetch;
  const result = await buildResolverSnapshot({
    endpoint: "https://resolver.example/api/v1/search",
    queries: [{ query: "short stories", by: "subject" }],
    fetchedAt: "2026-08-17T12:00:00.000Z",
    maxPagesPerQuery: 5,
    fetcher,
  });
  assert.equal(result.report.complete, false);
  assert.equal(result.report.queries[0]?.pages, 2);
  assert.match(result.report.queries[0]?.issue ?? "", /repeated a cursor/);
  assert.equal(result.entries.length, 1);
});

test("the official Gutenberg CSV importer handles multiline records without inventing rights or print years", () => {
  const csv = `Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves\r\n84,Text,1993-10-01,"Frankenstein; Or, The Modern Prometheus\nA Gothic Novel",en,"Shelley, Mary Wollstonecraft, 1797-1851","Science fiction; Monsters -- Fiction",PR,"Gothic Fiction; Category: Novels"\r\n85,Image,1993-10-02,Example scan,en,,,NE,Images\r\n1952,Text,1999-11-01,"The ""Yellow"" Wallpaper",en,"Gilman, Charlotte Perkins, 1860-1935","Mental health; Feminism",PS,Short Stories\r\n`;
  const { entries, report } = collectGutenberg(csv);
  assert.equal(report.complete, true);
  assert.equal(report.rowsRead, 3);
  assert.equal(report.textRecords, 2);
  assert.equal(report.skippedNonText, 1);
  assert.equal(entries[0]?.work.title, "Frankenstein; Or, The Modern Prometheus: A Gothic Novel");
  assert.deepEqual(entries[0]?.work.authors, ["Shelley, Mary Wollstonecraft"]);
  assert.equal(entries[1]?.work.title, 'The "Yellow" Wallpaper');
  assert.equal(entries.every((entry) => entry.work.year === undefined), true);
  assert.equal(entries.every((entry) => entry.work.offers.length === 0), true);
  assert.equal(entries.every((entry) => entry.work.sourceRecords[0]?.offers.length === 0), true);
  assert.match(report.notes.join(" "), /United States-specific/);

  const index = freshIndex();
  try {
    index.ingest(entries, "project-gutenberg-weekly-csv-v1");
    const result = index.search("Mental health");
    assert.equal(result.books[0]?.title, 'The "Yellow" Wallpaper');
    assert.equal(result.books[0]?.indexProvenance[0]?.merge.algorithmVersion, "project-gutenberg-weekly-csv-v1");
  } finally {
    index.close();
  }
});

test("a bounded Gutenberg CSV smoke import is explicitly incomplete", () => {
  const csv = `Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves\n1,Text,1971-12-01,First,en,Author,Subject,A,Shelf\n2,Text,1972-12-01,Second,en,Author,Subject,A,Shelf\n`;
  const { entries, report } = collectGutenberg(csv, 1);
  assert.equal(entries.length, 1);
  assert.equal(report.complete, false);
  assert.equal(report.lastRecordId, "1");
  assert.throws(() => collectGutenberg(csv.replace("Text#,Type", "id,type")), /Unexpected Project Gutenberg CSV header/);
});
