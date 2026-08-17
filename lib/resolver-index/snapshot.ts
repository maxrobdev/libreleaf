import type { NormalisedBook, SearchMode, SourceRecord } from "../sources/types.ts";
import { stableWorkId } from "../work-identity.ts";
import { INDEX_SCHEMA_VERSION, type ResolverIndexEntry } from "./types.ts";
import { validateIndexEntry } from "./database.ts";

const MAX_QUERIES = 1_000;
const MAX_PAGES_PER_QUERY = 10_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_CURSOR_LENGTH = 512;

export type SnapshotQuery = { query: string; by: SearchMode };

export type SnapshotReport = {
  schemaVersion: 1;
  endpoint: string;
  region: "GB" | "US" | "GLOBAL";
  fetchedAt: string;
  queries: Array<{
    query: string;
    by: SearchMode;
    pages: number;
    worksSeen: number;
    exhausted: boolean;
    issue?: string;
    sourceStates: Record<string, string>;
  }>;
  canonicalWorks: number;
  pagesFetched: number;
  complete: boolean;
};

type SearchPage = {
  books: NormalisedBook[];
  nextCursor: string | null;
  sources?: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Snapshot endpoint must be a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Snapshot endpoint must use HTTP or HTTPS.");
  if (url.username || url.password || url.search || url.hash) throw new Error("Snapshot endpoint must not contain credentials, a query or a fragment.");
  return url;
}

function validatedFetchedAt(value: string) {
  if (Number.isNaN(Date.parse(value))) throw new Error("Snapshot fetchedAt must be an ISO timestamp.");
  return new Date(value).toISOString();
}

function validateQuery(value: SnapshotQuery, index: number): SnapshotQuery {
  const query = value.query?.normalize("NFKC").trim();
  if (!query || query.length > 300) throw new Error(`Query ${index + 1} must contain 1-300 characters.`);
  if (!(["q", "title", "author", "subject"] as const).includes(value.by)) throw new Error(`Query ${index + 1} has an unsupported mode.`);
  return { query, by: value.by };
}

function parseSearchPage(value: unknown): SearchPage {
  if (!isRecord(value) || !Array.isArray(value.books)) throw new Error("Resolver returned an invalid search page.");
  const nextCursor = value.nextCursor;
  if (nextCursor !== null && nextCursor !== undefined && (typeof nextCursor !== "string" || nextCursor.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(nextCursor))) {
    throw new Error("Resolver returned an invalid cursor.");
  }
  const sources = isRecord(value.sources)
    ? Object.fromEntries(Object.entries(value.sources).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : undefined;
  return { books: value.books as NormalisedBook[], nextCursor: nextCursor ?? null, ...(sources ? { sources } : {}) };
}

async function fetchPage(url: URL, fetcher: typeof fetch) {
  const response = await fetcher(url, {
    headers: { Accept: "application/json", "User-Agent": "LibreLeaf-index-snapshot/1.0 (+https://github.com/maxrobdev/libreleaf)" },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status >= 300 && response.status < 400) throw new Error("Resolver endpoint redirected; configure its canonical API URL.");
  if (!response.ok) throw new Error(`Resolver returned HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("Resolver response exceeds 10 MiB.");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error("Resolver response exceeds 10 MiB.");
  try {
    return parseSearchPage(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Resolver returned invalid JSON.");
    throw error;
  }
}

function recordKey(record: SourceRecord) {
  return `${record.source}\n${record.recordId}`;
}

function mergeRecord(left: SourceRecord, right: SourceRecord): SourceRecord {
  const offers = new Map(left.offers.map((offer) => [`${offer.access}\n${offer.format ?? ""}\n${offer.url}`, offer]));
  for (const offer of right.offers) offers.set(`${offer.access}\n${offer.format ?? ""}\n${offer.url}`, offer);
  return { ...(right.offers.length >= left.offers.length ? right : left), offers: [...offers.values()] };
}

function mergeEntry(left: ResolverIndexEntry, right: ResolverIndexEntry): ResolverIndexEntry {
  const records = new Map(left.work.sourceRecords.map((record) => [recordKey(record), record]));
  for (const record of right.work.sourceRecords) {
    const key = recordKey(record);
    const existing = records.get(key);
    records.set(key, existing ? mergeRecord(existing, record) : record);
  }
  const sourceRecords = [...records.values()].sort((a, b) => a.source.localeCompare(b.source) || a.recordId.localeCompare(b.recordId));
  const offers = sourceRecords.flatMap((record) => record.offers);
  const reasons = [...new Set([...left.work.why, ...right.work.why])];
  const evidence = [...new Set([...left.merge.evidence, ...right.merge.evidence])];
  const richer = right.work.sourceRecords.length > left.work.sourceRecords.length ? right.work : left.work;
  return validateIndexEntry({
    ...left,
    fetchedAt: left.fetchedAt >= right.fetchedAt ? left.fetchedAt : right.fetchedAt,
    searchTerms: [...new Set([...(left.searchTerms ?? []), ...(right.searchTerms ?? [])])].sort(),
    merge: {
      method: sourceRecords.length > 1 ? "resolver-exact-cluster" : "single-source",
      algorithmVersion: "resolver-api-snapshot-v1",
      evidence: evidence.length > 0 ? evidence : [sourceRecords.length > 1 ? "Resolver API returned one canonical multi-source cluster." : "One retained source record."],
    },
    work: {
      ...richer,
      source: [...new Set(sourceRecords.map((record) => record.source))].join(" + "),
      detailsUrl: sourceRecords[0]?.detailsUrl ?? richer.detailsUrl,
      access: offers.some((offer) => offer.access === "download") ? "download" : richer.access,
      formats: offers.map(({ label, url }) => ({ label, url })),
      why: reasons,
      offers,
      sourceRecords,
    },
  });
}

function entryForBook(book: NormalisedBook, query: SnapshotQuery, fetchedAt: string) {
  const sourceCount = book.sourceRecords?.length ?? 0;
  const evidence = [...new Set([...(book.ranking?.reasons ?? []), ...(book.why ?? [])])].slice(0, 32);
  return validateIndexEntry({
    schemaVersion: INDEX_SCHEMA_VERSION,
    fetchedAt,
    searchTerms: [query.query],
    merge: {
      method: sourceCount > 1 ? "resolver-exact-cluster" : "single-source",
      algorithmVersion: "resolver-api-snapshot-v1",
      evidence: evidence.length > 0 ? evidence : [sourceCount > 1 ? "Resolver API returned one canonical multi-source cluster." : "One retained source record."],
    },
    work: book,
  });
}

export async function buildResolverSnapshot(options: {
  endpoint: string;
  queries: SnapshotQuery[];
  region?: "GB" | "US" | "GLOBAL";
  fetchedAt?: string;
  maxPagesPerQuery?: number;
  fetcher?: typeof fetch;
}): Promise<{ entries: ResolverIndexEntry[]; report: SnapshotReport }> {
  if (!Array.isArray(options.queries) || options.queries.length === 0 || options.queries.length > MAX_QUERIES) {
    throw new Error(`Snapshot needs 1-${MAX_QUERIES} queries.`);
  }
  const endpoint = safeEndpoint(options.endpoint);
  const queries = options.queries.map(validateQuery);
  const fetchedAt = validatedFetchedAt(options.fetchedAt ?? new Date().toISOString());
  const region = options.region ?? "GB";
  const maxPagesPerQuery = Math.min(MAX_PAGES_PER_QUERY, Math.max(1, Math.trunc(options.maxPagesPerQuery ?? 100)));
  const fetcher = options.fetcher ?? fetch;
  const entries = new Map<string, ResolverIndexEntry>();
  const reportQueries: SnapshotReport["queries"] = [];
  let pagesFetched = 0;

  for (const query of queries) {
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    let worksSeen = 0;
    let exhausted = false;
    let issue: string | undefined;
    const sourceStates: Record<string, string> = {};
    try {
      while (pages < maxPagesPerQuery) {
        const url = new URL(endpoint);
        url.searchParams.set("q", query.query);
        url.searchParams.set("by", query.by);
        url.searchParams.set("region", region);
        if (cursor) url.searchParams.set("cursor", cursor);
        const page = await fetchPage(url, fetcher);
        pages += 1;
        pagesFetched += 1;
        worksSeen += page.books.length;
        Object.assign(sourceStates, page.sources ?? {});
        for (const book of page.books) {
          const entry = entryForBook(book, query, fetchedAt);
          const canonicalId = entry.work.canonicalId ?? stableWorkId(entry.work);
          const current = entries.get(canonicalId);
          entries.set(canonicalId, current ? mergeEntry(current, entry) : entry);
        }
        if (!page.nextCursor) {
          exhausted = true;
          break;
        }
        if (seenCursors.has(page.nextCursor)) {
          issue = "Resolver repeated a cursor; crawl stopped without claiming exhaustion.";
          break;
        }
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      if (!exhausted && !issue && pages >= maxPagesPerQuery) issue = `Stopped at the configured ${maxPagesPerQuery}-page limit.`;
    } catch (error) {
      issue = error instanceof Error ? error.message : "Snapshot query failed.";
    }
    reportQueries.push({ query: query.query, by: query.by, pages, worksSeen, exhausted, ...(issue ? { issue } : {}), sourceStates });
  }

  const sortedEntries = [...entries.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, entry]) => entry);
  return {
    entries: sortedEntries,
    report: {
      schemaVersion: 1,
      endpoint: endpoint.toString(),
      region,
      fetchedAt,
      queries: reportQueries,
      canonicalWorks: sortedEntries.length,
      pagesFetched,
      complete: reportQueries.every((query) => query.exhausted),
    },
  };
}
