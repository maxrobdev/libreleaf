import { doabAdapter } from "../../../lib/sources/doab.ts";
import { libraryOfCongressAdapter } from "../../../lib/sources/library-of-congress.ts";
import { librivoxAdapter } from "../../../lib/sources/librivox.ts";
import type {
  Access,
  CatalogueSource,
  NormalisedBook,
  Offer,
  Rights,
  RightsRegion,
  SearchMode,
  SourceFetch,
  SourcePage,
  SourceRecord,
} from "../../../lib/sources/types.ts";
import { wikisourceAdapter } from "../../../lib/sources/wikisource.ts";
import { canonicalWorkUrl, stableWorkId } from "../../../lib/work-identity.ts";
import { publicApiMethodNotAllowed, publicApiOptions, withPublicApiHeaders } from "../../../lib/public-api.ts";

type GutendexBook = {
  id: number;
  title: string;
  authors?: { name?: string }[];
  formats?: Record<string, string>;
};

type OpenLibraryDoc = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  ebook_access?: "public" | "borrowable" | "printdisabled" | "no_ebook";
};

type SourceStatus = "ok" | "stale" | "deferred" | "unavailable" | "timeout" | "rate-limited" | "exhausted";
type SourceKey = "gutenberg" | "openLibrary" | "wikisource" | "doab" | "libraryOfCongress" | "librivox";

type CursorState = {
  v: 1;
  g: number;
  o: number;
  gd: boolean;
  od: boolean;
  gt: number | null;
  ot: number | null;
  w: number;
  d: number;
  wd: boolean;
  dd: boolean;
  wt: number | null;
  dt: number | null;
  l: number;
  ld: boolean;
  lt: number | null;
  a: number;
  ad: boolean;
  at: number | null;
};

type GutendexPage = {
  books: GutendexBook[];
  total: number | null;
  hasMore: boolean;
};

type OpenLibraryPage = {
  books: OpenLibraryDoc[];
  total: number | null;
  hasMore: boolean;
  pageSize: number;
};

type SearchSourcePage = GutendexPage | OpenLibraryPage | SourcePage;

type SourceHealth = {
  status: SourceStatus;
  durationMs: number;
  attempted: boolean;
  cache: "none" | "stale";
  circuit: "closed" | "open";
};

type CachedSourcePage = {
  storedAt: number;
  value: SearchSourcePage;
};

type SourceCircuit = {
  failures: number;
  openUntil: number;
  probing: boolean;
};

const GUTENDEX_PAGE_SIZE = 32;
const OPEN_LIBRARY_PAGE_SIZE = 32;
const LIBRARY_OF_CONGRESS_PAGE_SIZE = 20;
const LIBRIVOX_PAGE_SIZE = 20;
const MAX_PAGE = 10_000;
const MAX_OPEN_LIBRARY_OFFSET = (MAX_PAGE - 1) * OPEN_LIBRARY_PAGE_SIZE;
const MAX_ADAPTER_OFFSET = 500_000;
const MAX_CURSOR_LENGTH = 384;
const MAX_UPSTREAM_TOTAL = 100_000_000;
const UPSTREAM_TIMEOUT_MS = 6_000;
const OPEN_LIBRARY_TIMEOUT_MS = 2_000;
const OPEN_LIBRARY_FIELDS = "key,title,author_name,first_publish_year,cover_i,ebook_access";
const RRF_K = 60;
const DEFAULT_FIRST_RESULTS_BUDGET_MS = 2_500;
const SOURCE_CACHE_LIMIT = 128;
const SOURCE_STALE_MS = 24 * 60 * 60 * 1_000;
const CIRCUIT_FAILURE_THRESHOLD = 2;
const CIRCUIT_OPEN_MS = 30_000;

let firstResultsBudgetMs = DEFAULT_FIRST_RESULTS_BUDGET_MS;
const sourcePageCache = new Map<string, CachedSourcePage>();
const sourceCircuits = new Map<SourceKey, SourceCircuit>();

const successCacheHeaders = {
  "Cache-Control": "public, max-age=60, s-maxage=900, stale-while-revalidate=86400",
  "CDN-Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=1800, stale-while-revalidate=86400",
};

const partialCacheHeaders = {
  "Cache-Control": "public, max-age=15, s-maxage=60, stale-while-revalidate=120",
  "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
  "Netlify-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

const errorCacheHeaders = {
  "Cache-Control": "public, max-age=0, s-maxage=30",
  "Netlify-CDN-Cache-Control": "public, s-maxage=30",
};

const formatRanks: Record<string, number> = {
  EPUB: 0,
  PDF: 1,
  MOBI: 2,
  "Read online": 3,
  "Plain text": 4,
};

const accessRanks: Record<Access, number> = {
  download: 0,
  borrow: 1,
  read: 2,
  listen: 3,
  preview: 4,
};

const gutenbergRights: Rights = {
  status: "source-assessed-public-domain",
  jurisdiction: "US",
  note: "Project Gutenberg marks this edition as public domain in the United States. Copyright status may differ elsewhere.",
};

class SearchRequestError extends Error {}

class UpstreamError extends Error {
  constructor(readonly kind: "timeout" | "rate-limited" | "transient" | "unavailable" | "deferred") {
    super(kind);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function nullableTotal(value: unknown): value is number | null {
  return value === null || boundedInteger(value, 0, MAX_UPSTREAM_TOTAL);
}

function searchMode(value: string | null): SearchMode {
  if (value === null || value === "" || value === "q") return "q";
  if (value === "title" || value === "author" || value === "subject") return value;
  throw new SearchRequestError("Invalid search mode.");
}

function rightsRegion(value: string | null): RightsRegion {
  if (value === null || value === "" || value === "GB") return "GB";
  if (value === "US" || value === "GLOBAL") return value;
  throw new SearchRequestError("Invalid rights region.");
}

function initialCursor(pageValue: string | null): CursorState {
  if (pageValue === null || pageValue === "") {
    return { v: 1, g: 1, o: 0, gd: false, od: false, gt: null, ot: null, w: 0, d: 0, wd: false, dd: false, wt: null, dt: null, l: 0, ld: false, lt: null, a: 0, ad: false, at: null };
  }
  if (!/^\d{1,5}$/.test(pageValue)) throw new SearchRequestError("Invalid page.");
  const page = Number(pageValue);
  if (!boundedInteger(page, 1, MAX_PAGE)) throw new SearchRequestError("Invalid page.");
  return {
    v: 1,
    g: page,
    o: (page - 1) * OPEN_LIBRARY_PAGE_SIZE,
    gd: false,
    od: false,
    gt: null,
    ot: null,
    w: (page - 1) * 16,
    d: (page - 1) * 10,
    wd: false,
    dd: false,
    wt: null,
    dt: null,
    l: (page - 1) * LIBRARY_OF_CONGRESS_PAGE_SIZE,
    ld: false,
    lt: null,
    a: (page - 1) * LIBRIVOX_PAGE_SIZE,
    ad: false,
    at: null,
  };
}

function encodeCursor(cursor: CursorState): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(value: string): CursorState {
  if (!value || value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new SearchRequestError("Invalid cursor.");
  }
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - base64.length % 4) % 4);
    const parsed: unknown = JSON.parse(atob(base64 + padding));
    if (
      !isRecord(parsed)
      || parsed.v !== 1
      || !boundedInteger(parsed.g, 1, MAX_PAGE)
      || !boundedInteger(parsed.o, 0, MAX_OPEN_LIBRARY_OFFSET)
      || typeof parsed.gd !== "boolean"
      || typeof parsed.od !== "boolean"
      || !nullableTotal(parsed.gt)
      || !nullableTotal(parsed.ot)
    ) {
      throw new Error("Invalid cursor state.");
    }
    const legacy = parsed as unknown as Partial<CursorState> & Pick<CursorState, "v" | "g" | "o" | "gd" | "od" | "gt" | "ot">;
    const w = legacy.w ?? 0;
    const d = legacy.d ?? 0;
    const l = legacy.l ?? 0;
    const a = legacy.a ?? 0;
    if (
      !boundedInteger(w, 0, MAX_ADAPTER_OFFSET)
      || !boundedInteger(d, 0, MAX_ADAPTER_OFFSET)
      || !boundedInteger(l, 0, MAX_ADAPTER_OFFSET)
      || !boundedInteger(a, 0, MAX_ADAPTER_OFFSET)
    ) {
      throw new Error("Invalid adapter cursor state.");
    }
    return {
      ...legacy,
      w,
      d,
      wd: typeof legacy.wd === "boolean" ? legacy.wd : false,
      dd: typeof legacy.dd === "boolean" ? legacy.dd : false,
      wt: nullableTotal(legacy.wt) ? legacy.wt : null,
      dt: nullableTotal(legacy.dt) ? legacy.dt : null,
      l,
      ld: typeof legacy.ld === "boolean" ? legacy.ld : false,
      lt: nullableTotal(legacy.lt) ? legacy.lt : null,
      a,
      ad: typeof legacy.ad === "boolean" ? legacy.ad : false,
      at: nullableTotal(legacy.at) ? legacy.at : null,
    } as CursorState;
  } catch {
    throw new SearchRequestError("Invalid cursor.");
  }
}

function buildCatalogueUrls(query: string, by: SearchMode, cursor: CursorState) {
  const gutendex = new URL("https://gutendex.com/books/");
  const openLibrary = new URL("https://openlibrary.org/search.json");

  if (query) {
    gutendex.searchParams.set(by === "subject" ? "topic" : "search", query);
    openLibrary.searchParams.set(by, query);
  } else {
    gutendex.searchParams.set("sort", "popular");
    openLibrary.searchParams.set("q", "classic");
    openLibrary.searchParams.set("sort", "rating");
  }

  gutendex.searchParams.set("page", String(cursor.g));
  openLibrary.searchParams.set("offset", String(cursor.o));
  openLibrary.searchParams.set("limit", String(OPEN_LIBRARY_PAGE_SIZE));
  openLibrary.searchParams.set("fields", OPEN_LIBRARY_FIELDS);

  return { gutendex: gutendex.toString(), openLibrary: openLibrary.toString() };
}

async function fetchJson(url: string, userAgent?: string, timeout = UPSTREAM_TIMEOUT_MS): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (userAgent) headers["User-Agent"] = userAgent;

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeout),
    });
    if (response.status === 429) throw new UpstreamError("rate-limited");
    if (response.status >= 500) throw new UpstreamError("transient");
    if (!response.ok) throw new UpstreamError("unavailable");
    return response.json();
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (isRecord(error) && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new UpstreamError("timeout");
    }
    throw new UpstreamError("unavailable");
  }
}

function upstreamTotal(value: unknown): number | null {
  return boundedInteger(value, 0, MAX_UPSTREAM_TOTAL) ? value : null;
}

async function fetchGutendex(url: string, sourceFetch: SourceFetch = fetchJson): Promise<GutendexPage> {
  const payload = await sourceFetch(url);
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new Error("Gutendex returned an invalid response.");
  }
  const total = upstreamTotal(payload.count);
  const page = Number(new URL(url).searchParams.get("page") ?? "1");
  return {
    books: payload.results as GutendexBook[],
    total,
    hasMore: typeof payload.next === "string"
      || (payload.next !== null && total !== null && page * GUTENDEX_PAGE_SIZE < total),
  };
}

async function fetchOpenLibrary(url: string, sourceFetch: SourceFetch = fetchJson): Promise<OpenLibraryPage> {
  const payload = await sourceFetch(
    url,
    "LibreLeaf/0.1 (+https://github.com/maxrobdev/libreleaf)",
    OPEN_LIBRARY_TIMEOUT_MS,
  );
  if (!isRecord(payload) || !Array.isArray(payload.docs)) {
    throw new Error("Open Library returned an invalid response.");
  }
  const total = upstreamTotal(payload.numFound ?? payload.num_found);
  const requestUrl = new URL(url);
  const numericOffset = Number(requestUrl.searchParams.get("offset") ?? "0");
  const pageSize = Number(requestUrl.searchParams.get("limit") ?? String(OPEN_LIBRARY_PAGE_SIZE));
  return {
    books: payload.docs as OpenLibraryDoc[],
    total,
    hasMore: total === null
      ? payload.docs.length === pageSize
      : numericOffset + payload.docs.length < total,
    pageSize,
  };
}

function statusForFailure(error: unknown): Exclude<SourceStatus, "ok" | "stale" | "exhausted"> {
  if (error instanceof UpstreamError) {
    if (error.kind === "timeout") return "timeout";
    if (error.kind === "rate-limited") return "rate-limited";
    if (error.kind === "deferred") return "deferred";
  }
  return "unavailable";
}

function quantizedDuration(startedAt: number, finishedAt: number) {
  const elapsed = Math.max(0, finishedAt - startedAt);
  return Math.min(firstResultsBudgetMs, Math.ceil(elapsed / 25) * 25);
}

function cachedSourcePage<T extends SearchSourcePage>(key: string, now: number): T | undefined {
  const cached = sourcePageCache.get(key);
  if (!cached) return undefined;
  if (now - cached.storedAt > SOURCE_STALE_MS) {
    sourcePageCache.delete(key);
    return undefined;
  }
  sourcePageCache.delete(key);
  sourcePageCache.set(key, cached);
  return cached.value as T;
}

function rememberSourcePage(key: string, value: SearchSourcePage, now: number) {
  sourcePageCache.delete(key);
  sourcePageCache.set(key, { storedAt: now, value });
  while (sourcePageCache.size > SOURCE_CACHE_LIMIT) {
    const oldest = sourcePageCache.keys().next().value as string | undefined;
    if (!oldest) break;
    sourcePageCache.delete(oldest);
  }
}

function recordSourceFailure(source: SourceKey, now: number) {
  const current = sourceCircuits.get(source) ?? { failures: 0, openUntil: 0, probing: false };
  const failures = current.failures + 1;
  sourceCircuits.set(source, {
    failures,
    openUntil: failures >= CIRCUIT_FAILURE_THRESHOLD ? now + CIRCUIT_OPEN_MS : 0,
    probing: false,
  });
}

function sourceCircuitState(source: SourceKey, now: number) {
  const current = sourceCircuits.get(source);
  if (!current) return { skip: false, state: "closed" as const };
  if (current.openUntil > now) return { skip: true, state: "open" as const };
  if (current.openUntil > 0) {
    if (current.probing) return { skip: true, state: "open" as const };
    current.probing = true;
  }
  return { skip: false, state: current.openUntil > 0 ? "open" as const : "closed" as const };
}

async function reliableSource<T extends SearchSourcePage>(
  source: SourceKey,
  cacheKey: string,
  operation: () => Promise<T>,
  health: Partial<Record<SourceKey, SourceHealth>>,
): Promise<T> {
  const startedAt = Date.now();
  const circuit = sourceCircuitState(source, startedAt);
  if (circuit.skip) {
    const cached = cachedSourcePage<T>(cacheKey, startedAt);
    health[source] = {
      status: cached ? "stale" : "deferred",
      durationMs: 0,
      attempted: false,
      cache: cached ? "stale" : "none",
      circuit: "open",
    };
    if (cached) return cached;
    throw new UpstreamError("deferred");
  }

  try {
    const value = await operation();
    const finishedAt = Date.now();
    rememberSourcePage(cacheKey, value, finishedAt);
    sourceCircuits.delete(source);
    health[source] = {
      status: "ok",
      durationMs: quantizedDuration(startedAt, finishedAt),
      attempted: true,
      cache: "none",
      circuit: "closed",
    };
    return value;
  } catch (error) {
    const finishedAt = Date.now();
    recordSourceFailure(source, finishedAt);
    const cached = cachedSourcePage<T>(cacheKey, finishedAt);
    const opened = (sourceCircuits.get(source)?.openUntil ?? 0) > finishedAt;
    health[source] = {
      status: cached ? "stale" : statusForFailure(error),
      durationMs: quantizedDuration(startedAt, finishedAt),
      attempted: true,
      cache: cached ? "stale" : "none",
      circuit: opened ? "open" : circuit.state,
    };
    if (cached) return cached;
    throw error;
  }
}

function sourceCacheKey(source: SourceKey, query: string, by: SearchMode, region: RightsRegion, position: number) {
  return JSON.stringify([source, query, by, region, position]);
}

export function resetSearchReliabilityForTests(budgetMs = DEFAULT_FIRST_RESULTS_BUDGET_MS) {
  sourcePageCache.clear();
  sourceCircuits.clear();
  firstResultsBudgetMs = budgetMs;
}

function safeGutenbergUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (url.hostname !== "gutenberg.org" && !url.hostname.endsWith(".gutenberg.org")) return undefined;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return undefined;
  }
}

function formatLabel(mime: string): string | undefined {
  const normalised = mime.toLocaleLowerCase();
  if (normalised === "application/epub+zip") return "EPUB";
  if (normalised === "application/pdf") return "PDF";
  if (normalised === "application/x-mobipocket-ebook") return "MOBI";
  if (normalised.startsWith("text/html")) return "Read online";
  if (normalised.startsWith("text/plain")) return "Plain text";
  return undefined;
}

function formatsForBook(formats: Record<string, string> | undefined) {
  if (!formats) return [];
  const unique = new Map<string, string>();
  for (const [mime, rawUrl] of Object.entries(formats)) {
    const label = formatLabel(mime);
    const url = safeGutenbergUrl(rawUrl);
    if (!label || !url || new URL(url).pathname.toLocaleLowerCase().endsWith(".zip")) continue;
    if (!unique.has(label)) unique.set(label, url);
  }
  return [...unique]
    .map(([label, url]) => ({ label, url }))
    .sort((a, b) => formatRanks[a.label] - formatRanks[b.label]);
}

function normaliseText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normaliseAuthor(value: string) {
  return normaliseText(value).split(" ").filter(Boolean).sort().join(" ");
}

function clusterKey(book: NormalisedBook): string | undefined {
  const title = normaliseText(book.title);
  const author = normaliseAuthor(book.authors[0] ?? "");
  return title && author ? `${title}|${author}` : undefined;
}

function annotateSourceRanks(
  books: NormalisedBook[],
  source: CatalogueSource,
  firstRank: number,
) {
  return books.map((book, index) => ({
    ...book,
    sourceRanks: [{ source, rank: firstRank + index }],
  }));
}

function mergedSourceRanks(primary: NormalisedBook, secondary: NormalisedBook) {
  const bestBySource = new Map<CatalogueSource, number>();
  for (const item of [...(primary.sourceRanks ?? []), ...(secondary.sourceRanks ?? [])]) {
    const current = bestBySource.get(item.source);
    if (current === undefined || item.rank < current) bestBySource.set(item.source, item.rank);
  }
  return [...bestBySource]
    .map(([source, rank]) => ({ source, rank }))
    .sort((left, right) => left.rank - right.rank || left.source.localeCompare(right.source));
}

function matchSignal(book: NormalisedBook, query: string, by: SearchMode) {
  const wanted = normaliseText(query);
  if (!wanted) return { boost: 0, reason: "" };

  if (by === "author") {
    const wantedAuthor = normaliseAuthor(query);
    if (book.authors.some((author) => normaliseAuthor(author) === wantedAuthor)) {
      return { boost: 0.02, reason: "Exact normalized author match." };
    }
    return { boost: 0, reason: "" };
  }

  if ((by === "title" || by === "q") && normaliseText(book.title) === wanted) {
    return { boost: 0.02, reason: "Exact normalized title match." };
  }
  return { boost: 0, reason: "" };
}

function rankBooks(books: NormalisedBook[], query: string, by: SearchMode) {
  return books
    .map((book) => {
      const sourceRanks = [...(book.sourceRanks ?? [])]
        .sort((left, right) => left.rank - right.rank || left.source.localeCompare(right.source));
      const reciprocalScore = sourceRanks.reduce((score, item) => score + 1 / (RRF_K + item.rank), 0);
      const signal = matchSignal(book, query, by);
      const score = Math.round((reciprocalScore + signal.boost) * 1_000_000) / 1_000_000;
      const reasons = sourceRanks.map((item) => `Ranked #${item.rank} by ${item.source}.`);
      if (sourceRanks.length > 1) reasons.push(`Confirmed by ${sourceRanks.length} independent catalogues.`);
      if (signal.reason) reasons.push(signal.reason);
      return {
        ...book,
        ranking: { method: "rrf-v1" as const, score, sourceRanks, reasons },
      };
    })
    .sort((left, right) => {
      const scoreDifference = (right.ranking?.score ?? 0) - (left.ranking?.score ?? 0);
      if (scoreDifference) return scoreDifference;
      const leftRank = left.ranking?.sourceRanks[0]?.rank ?? Number.MAX_SAFE_INTEGER;
      const rightRank = right.ranking?.sourceRanks[0]?.rank ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.title.localeCompare(right.title);
    });
}

function addCanonicalIdentity(books: NormalisedBook[]) {
  return books.map((book) => {
    const canonicalId = stableWorkId(book);
    return { ...book, canonicalId, canonicalUrl: canonicalWorkUrl(book, canonicalId) };
  });
}

function offersForGutenberg(formats: { label: string; url: string }[]): Offer[] {
  return formats.map((format) => ({
    source: "Project Gutenberg",
    access: "download",
    label: format.label === "Read online" ? "Read online" : `Download ${format.label}`,
    url: format.url,
    format: format.label,
    rights: gutenbergRights,
  }));
}

function normaliseGutenbergBooks(rawBooks: GutendexBook[]): NormalisedBook[] {
  return rawBooks.flatMap((book) => {
    if (!isRecord(book) || !Number.isInteger(book.id) || typeof book.title !== "string" || !book.title.trim()) return [];
    const authors = Array.isArray(book.authors)
      ? book.authors.flatMap((author) => typeof author?.name === "string" ? [author.name] : [])
      : [];
    const formats = formatsForBook(book.formats);
    const cover = safeGutenbergUrl(book.formats?.["image/jpeg"]);
    const detailsUrl = `https://www.gutenberg.org/ebooks/${book.id}`;
    const offers = offersForGutenberg(formats);
    const sourceRecord: SourceRecord = {
      source: "Project Gutenberg",
      recordId: String(book.id),
      detailsUrl,
      offers,
    };

    return [{
      id: `gutenberg-${book.id}`,
      title: book.title.trim(),
      authors,
      cover,
      source: "Project Gutenberg",
      access: "download",
      formats,
      detailsUrl,
      clusterConfidence: "probable",
      why: ["Matched in Project Gutenberg; its download files are source-assessed as public domain in the United States."],
      offers,
      sourceRecords: [sourceRecord],
    }];
  });
}

function normaliseOpenLibraryBooks(rawBooks: OpenLibraryDoc[]): NormalisedBook[] {
  return rawBooks.flatMap((book) => {
    if (!isRecord(book) || typeof book.key !== "string" || !book.key.startsWith("/") || typeof book.title !== "string" || !book.title.trim()) return [];
    const authors = Array.isArray(book.author_name)
      ? book.author_name.filter((author): author is string => typeof author === "string").slice(0, 3)
      : [];
    const coverId = Number.isInteger(book.cover_i) && Number(book.cover_i) > 0 ? Number(book.cover_i) : undefined;
    const year = Number.isInteger(book.first_publish_year) ? book.first_publish_year : undefined;
    const workKey = book.key.startsWith("/works/") ? book.key : undefined;
    const detailsUrl = `https://openlibrary.org${book.key}`;
    const access: Access = book.ebook_access === "borrowable" || book.ebook_access === "printdisabled" ? "borrow" : "preview";
    const offer: Offer = {
      source: "Open Library",
      access,
      label: access === "borrow" ? "Borrow from Open Library" : "View on Open Library",
      url: detailsUrl,
    };
    const sourceRecord: SourceRecord = {
      source: "Open Library",
      recordId: book.key,
      detailsUrl,
      workKey,
      offers: [offer],
    };

    return [{
      id: `openlibrary-${book.key}`,
      title: book.title.trim(),
      authors,
      year,
      cover: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined,
      source: "Open Library",
      access,
      formats: [],
      detailsUrl,
      workKey,
      clusterConfidence: "probable",
      why: [access === "borrow"
        ? "Matched an Open Library work with a borrowing route."
        : "Matched an Open Library work with a catalogue or preview route."],
      offers: [offer],
      sourceRecords: [sourceRecord],
    }];
  });
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeBooks(primary: NormalisedBook, secondary: NormalisedBook): NormalisedBook {
  const sourceRecords = uniqueBy(
    [...primary.sourceRecords, ...secondary.sourceRecords],
    (record) => `${record.source}|${record.recordId}`,
  );
  const offers = uniqueBy(
    [...primary.offers, ...secondary.offers],
    (offer) => `${offer.source}|${offer.access}|${offer.format ?? ""}|${offer.url}`,
  );
  const formats = uniqueBy(
    offers.flatMap((offer) => offer.access === "download" && offer.format
      ? [{ label: offer.format, url: offer.url }]
      : []),
    (format) => `${format.label}|${format.url}`,
  ).sort((a, b) => (formatRanks[a.label] ?? 99) - (formatRanks[b.label] ?? 99));
  const access = offers.reduce<Access>(
    (best, offer) => accessRanks[offer.access] < accessRanks[best] ? offer.access : best,
    primary.access,
  );
  const sources = uniqueBy(sourceRecords.map((record) => record.source), (source) => source);

  return {
    ...primary,
    authors: primary.authors.length ? primary.authors : secondary.authors,
    year: primary.year ?? secondary.year,
    cover: primary.cover ?? secondary.cover,
    source: sources.join(" + "),
    access,
    formats,
    workKey: primary.workKey ?? secondary.workKey,
    clusterConfidence: "exact",
    why: uniqueBy([
      ...primary.why,
      ...secondary.why,
      "Exact normalized title and primary-author match across catalogue records.",
    ], (reason) => reason),
    offers,
    sourceRecords,
    sourceRanks: mergedSourceRanks(primary, secondary),
  };
}

function offerApplicability(offer: Offer, region: RightsRegion): NonNullable<Rights["applicability"]> {
  const rights = offer.rights;
  if (!rights) return "check-local";
  if (rights.status === "source-assessed-public-domain") {
    return region === "US" && rights.jurisdiction === "US" ? "verified" : "source-jurisdiction-only";
  }
  if (rights.status === "open-licence" && rights.licenceUrl) return "verified";
  return "check-local";
}

function applyRightsContext(books: NormalisedBook[], region: RightsRegion) {
  return books.map((book) => {
    const offers = book.offers.map((offer) => offer.rights
      ? { ...offer, rights: { ...offer.rights, applicability: offerApplicability(offer, region) } }
      : offer);
    const offerByUrl = new Map(offers.map((offer) => [offer.url, offer]));
    return {
      ...book,
      offers,
      sourceRecords: book.sourceRecords.map((record) => ({
        ...record,
        offers: record.offers.map((offer) => offerByUrl.get(offer.url) ?? offer),
      })),
    };
  });
}

function hasAccess(book: NormalisedBook, access: Access) {
  return book.access === access || book.offers.some((offer) => offer.access === access);
}

function rightsContext(region: RightsRegion) {
  const labels: Record<RightsRegion, string> = {
    GB: "United Kingdom",
    US: "United States",
    GLOBAL: "Global / location not specified",
  };
  return {
    region,
    label: labels[region],
    note: "This setting reports source and licence context; it is not a legal determination. Check local law and edition-specific terms.",
  };
}

function clusterBooks(candidates: NormalisedBook[]) {
  const books: NormalisedBook[] = [];
  const clusters = new Map<string, number>();

  for (const candidate of candidates) {
    const key = clusterKey(candidate);
    const existingIndex = key ? clusters.get(key) : undefined;
    if (existingIndex === undefined) {
      const index = books.push(candidate) - 1;
      if (key) clusters.set(key, index);
      continue;
    }
    books[existingIndex] = mergeBooks(books[existingIndex], candidate);
  }
  return books;
}

function advanceCursor(
  current: CursorState,
  gutenbergResult: PromiseSettledResult<GutendexPage> | undefined,
  libraryResult: PromiseSettledResult<OpenLibraryPage> | undefined,
  wikisourceResult: PromiseSettledResult<SourcePage> | undefined,
  doabResult: PromiseSettledResult<SourcePage> | undefined,
  libraryOfCongressResult: PromiseSettledResult<SourcePage> | undefined,
  librivoxResult: PromiseSettledResult<SourcePage> | undefined,
  statuses: Record<SourceKey, SourceStatus>,
) {
  const next = { ...current };

  if (gutenbergResult?.status === "fulfilled" && statuses.gutenberg === "ok") {
    next.gt = gutenbergResult.value.total ?? next.gt;
    next.gd = !gutenbergResult.value.hasMore || current.g >= MAX_PAGE;
    if (!next.gd) next.g = current.g + 1;
  }
  if (libraryResult?.status === "fulfilled" && statuses.openLibrary === "ok") {
    next.ot = libraryResult.value.total ?? next.ot;
    next.od = !libraryResult.value.hasMore || current.o >= MAX_OPEN_LIBRARY_OFFSET;
    if (!next.od) next.o = current.o + libraryResult.value.pageSize;
  }
  if (wikisourceResult?.status === "fulfilled" && statuses.wikisource === "ok") {
    next.wt = wikisourceResult.value.total ?? next.wt;
    next.wd = !wikisourceResult.value.hasMore || current.w >= MAX_ADAPTER_OFFSET;
    if (!next.wd) next.w = current.w + wikisourceResult.value.advanceBy;
  }
  if (doabResult?.status === "fulfilled" && statuses.doab === "ok") {
    next.dt = doabResult.value.total ?? next.dt;
    next.dd = !doabResult.value.hasMore || current.d >= MAX_ADAPTER_OFFSET;
    if (!next.dd) next.d = current.d + doabResult.value.advanceBy;
  }
  if (libraryOfCongressResult?.status === "fulfilled" && statuses.libraryOfCongress === "ok") {
    next.lt = libraryOfCongressResult.value.total ?? next.lt;
    next.ld = !libraryOfCongressResult.value.hasMore || current.l >= MAX_ADAPTER_OFFSET;
    if (!next.ld) next.l = current.l + libraryOfCongressResult.value.advanceBy;
  }
  if (librivoxResult?.status === "fulfilled" && statuses.librivox === "ok") {
    next.at = librivoxResult.value.total ?? next.at;
    next.ad = !librivoxResult.value.hasMore || current.a >= MAX_ADAPTER_OFFSET;
    if (!next.ad) next.a = current.a + librivoxResult.value.advanceBy;
  }

  return next;
}

function sourceStatus(
  done: boolean,
  result: PromiseSettledResult<unknown> | undefined,
  health: SourceHealth | undefined,
): SourceStatus {
  if (done) return "exhausted";
  if (health) return health.status;
  if (result?.status === "fulfilled") return "ok";
  if (result?.status === "rejected" && result.reason instanceof UpstreamError) {
    if (result.reason.kind === "timeout") return "timeout";
    if (result.reason.kind === "rate-limited") return "rate-limited";
    if (result.reason.kind === "deferred") return "deferred";
  }
  return "unavailable";
}

function sourceHealthFor(
  done: boolean,
  status: SourceStatus,
  health: SourceHealth | undefined,
): SourceHealth {
  if (health) return { ...health, status };
  return {
    status: done ? "exhausted" : status,
    durationMs: 0,
    attempted: false,
    cache: "none",
    circuit: "closed",
  };
}

async function handleSearchRequest(request: Request) {
  try {
    const searchStartedAt = Date.now();
    const firstResultsDeadline = searchStartedAt + firstResultsBudgetMs;
    const health: Partial<Record<SourceKey, SourceHealth>> = {};
    const params = new URL(request.url).searchParams;
    const queries = params.getAll("q");
    if (queries.length > 1) throw new SearchRequestError("Provide one query value.");
    const rawQuery = queries[0] ?? "";
    if (rawQuery.length > 120) throw new SearchRequestError("Query must be 120 characters or fewer.");
    if (params.has("cursor") && params.has("page")) throw new SearchRequestError("Use cursor or page, not both.");
    const query = rawQuery.trim();
    const by = searchMode(params.get("by"));
    const region = rightsRegion(params.get("region"));
    const cursor = params.has("cursor")
      ? decodeCursor(params.get("cursor") ?? "")
      : initialCursor(params.get("page"));
    const urls = buildCatalogueUrls(query, by, cursor);
    const fetchWithinBudget: SourceFetch = (url, userAgent, requestedTimeout = UPSTREAM_TIMEOUT_MS) => {
      const remaining = Math.max(1, firstResultsDeadline - Date.now());
      return fetchJson(url, userAgent, Math.min(requestedTimeout, remaining));
    };

    const gutenbergPromise = cursor.gd
      ? undefined
      : reliableSource(
        "gutenberg",
        sourceCacheKey("gutenberg", query, by, region, cursor.g),
        () => fetchGutendex(urls.gutendex, fetchWithinBudget),
        health,
      );
    const libraryPromise = cursor.od
      ? undefined
      : reliableSource(
        "openLibrary",
        sourceCacheKey("openLibrary", query, by, region, cursor.o),
        () => fetchOpenLibrary(urls.openLibrary, fetchWithinBudget),
        health,
      );
    const wikisourcePromise = cursor.wd
      ? undefined
      : reliableSource(
        "wikisource",
        sourceCacheKey("wikisource", query, by, region, cursor.w),
        () => wikisourceAdapter.search({ query, by, offset: cursor.w, region }, fetchWithinBudget),
        health,
      );
    const doabPromise = cursor.dd
      ? undefined
      : reliableSource(
        "doab",
        sourceCacheKey("doab", query, by, region, cursor.d),
        () => doabAdapter.search({ query, by, offset: cursor.d, region }, fetchWithinBudget),
        health,
      );
    const libraryOfCongressPromise = cursor.ld
      ? undefined
      : reliableSource(
        "libraryOfCongress",
        sourceCacheKey("libraryOfCongress", query, by, region, cursor.l),
        () => libraryOfCongressAdapter.search({ query, by, offset: cursor.l, region }, fetchWithinBudget),
        health,
      );
    const librivoxPromise = cursor.ad
      ? undefined
      : reliableSource(
        "librivox",
        sourceCacheKey("librivox", query, by, region, cursor.a),
        () => librivoxAdapter.search({ query, by, offset: cursor.a, region }, fetchWithinBudget),
        health,
      );
    const pending = [gutenbergPromise, libraryPromise, wikisourcePromise, doabPromise, libraryOfCongressPromise, librivoxPromise]
      .filter(Boolean) as Array<Promise<GutendexPage | OpenLibraryPage | SourcePage>>;
    const settled = await Promise.allSettled(pending);
    let settledIndex = 0;
    const gutenbergResult = gutenbergPromise
      ? settled[settledIndex++] as PromiseSettledResult<GutendexPage>
      : undefined;
    const libraryResult = libraryPromise
      ? settled[settledIndex++] as PromiseSettledResult<OpenLibraryPage>
      : undefined;
    const wikisourceResult = wikisourcePromise
      ? settled[settledIndex++] as PromiseSettledResult<SourcePage>
      : undefined;
    const doabResult = doabPromise
      ? settled[settledIndex++] as PromiseSettledResult<SourcePage>
      : undefined;
    const libraryOfCongressResult = libraryOfCongressPromise
      ? settled[settledIndex++] as PromiseSettledResult<SourcePage>
      : undefined;
    const librivoxResult = librivoxPromise
      ? settled[settledIndex] as PromiseSettledResult<SourcePage>
      : undefined;

    const sources: Record<SourceKey, SourceStatus> = {
      gutenberg: sourceStatus(cursor.gd, gutenbergResult, health.gutenberg),
      openLibrary: sourceStatus(cursor.od, libraryResult, health.openLibrary),
      wikisource: sourceStatus(cursor.wd, wikisourceResult, health.wikisource),
      doab: sourceStatus(cursor.dd, doabResult, health.doab),
      libraryOfCongress: sourceStatus(cursor.ld, libraryOfCongressResult, health.libraryOfCongress),
      librivox: sourceStatus(cursor.ad, librivoxResult, health.librivox),
    };
    const sourceHealth: Record<SourceKey, SourceHealth> = {
      gutenberg: sourceHealthFor(cursor.gd, sources.gutenberg, health.gutenberg),
      openLibrary: sourceHealthFor(cursor.od, sources.openLibrary, health.openLibrary),
      wikisource: sourceHealthFor(cursor.wd, sources.wikisource, health.wikisource),
      doab: sourceHealthFor(cursor.dd, sources.doab, health.doab),
      libraryOfCongress: sourceHealthFor(cursor.ld, sources.libraryOfCongress, health.libraryOfCongress),
      librivox: sourceHealthFor(cursor.ad, sources.librivox, health.librivox),
    };

    const runningNodeTest = typeof process !== "undefined" && Boolean(process.env.NODE_TEST_CONTEXT);
    if (!runningNodeTest) for (const [source, diagnostic] of Object.entries(sourceHealth)) {
      console.info("[search-source]", JSON.stringify({ source, ...diagnostic }));
    }

    const attempted = [
      gutenbergResult,
      libraryResult,
      wikisourceResult,
      doabResult,
      libraryOfCongressResult,
      librivoxResult,
    ].filter(Boolean);
    if (attempted.length && attempted.every((result) => result?.status === "rejected")) {
      return Response.json(
        {
          error: "Catalogues are temporarily unavailable.",
          nextCursor: encodeCursor(cursor),
          sources,
          sourceHealth,
          searchTiming: {
            firstResultsBudgetMs,
            totalMs: quantizedDuration(searchStartedAt, Date.now()),
          },
        },
        { status: 502, headers: errorCacheHeaders },
      );
    }

    const gutenbergBooks = annotateSourceRanks(normaliseGutenbergBooks(
      gutenbergResult?.status === "fulfilled" ? gutenbergResult.value.books : [],
    ), "Project Gutenberg", (cursor.g - 1) * GUTENDEX_PAGE_SIZE + 1);
    const libraryBooks = annotateSourceRanks(normaliseOpenLibraryBooks(
      libraryResult?.status === "fulfilled" ? libraryResult.value.books : [],
    ), "Open Library", cursor.o + 1);
    const wikisourceBooks = annotateSourceRanks(
      wikisourceResult?.status === "fulfilled" ? wikisourceResult.value.books : [],
      "Wikisource",
      cursor.w + 1,
    );
    const doabBooks = annotateSourceRanks(
      doabResult?.status === "fulfilled" ? doabResult.value.books : [],
      "DOAB",
      cursor.d + 1,
    );
    const libraryOfCongressBooks = annotateSourceRanks(
      libraryOfCongressResult?.status === "fulfilled" ? libraryOfCongressResult.value.books : [],
      "Library of Congress",
      cursor.l + 1,
    );
    const librivoxBooks = annotateSourceRanks(
      librivoxResult?.status === "fulfilled" ? librivoxResult.value.books : [],
      "LibriVox",
      cursor.a + 1,
    );
    const books = addCanonicalIdentity(applyRightsContext(rankBooks(
      clusterBooks([...gutenbergBooks, ...libraryBooks, ...wikisourceBooks, ...doabBooks, ...libraryOfCongressBooks, ...librivoxBooks]),
      query,
      by,
    ), region));
    const next = advanceCursor(
      cursor,
      gutenbergResult,
      libraryResult,
      wikisourceResult,
      doabResult,
      libraryOfCongressResult,
      librivoxResult,
      sources,
    );
    const nextCursor = next.gd && next.od && next.wd && next.dd && next.ld && next.ad ? null : encodeCursor(next);

    const partial = Object.values(sources).some((status) => status !== "ok" && status !== "exhausted");

    return Response.json({
      query,
      books,
      counts: {
        total: books.length,
        download: books.filter((book) => hasAccess(book, "download")).length,
        borrow: books.filter((book) => hasAccess(book, "borrow")).length,
        preview: books.filter((book) => hasAccess(book, "preview")).length,
        read: books.filter((book) => hasAccess(book, "read")).length,
        listen: books.filter((book) => hasAccess(book, "listen")).length,
      },
      nextCursor,
      upstreamTotals: {
        gutenberg: next.gt,
        openLibrary: next.ot,
        wikisource: next.wt,
        doab: next.dt,
        libraryOfCongress: next.lt,
        librivox: next.at,
      },
      partial,
      sources,
      sourceHealth,
      searchTiming: {
        firstResultsBudgetMs,
        totalMs: quantizedDuration(searchStartedAt, Date.now()),
      },
      ranking: {
        method: "rrf-v1",
        k: RRF_K,
        note: "Reciprocal Rank Fusion combines each catalogue's result position; exact requested title or author metadata receives a small, disclosed boost.",
      },
      rightsContext: rightsContext(region),
    }, { headers: partial ? partialCacheHeaders : successCacheHeaders });
  } catch (error) {
    const isRequestError = error instanceof SearchRequestError;
    return Response.json(
      { error: isRequestError ? error.message : "The search request could not be processed." },
      { status: 400, headers: errorCacheHeaders },
    );
  }
}

export async function GET(request: Request) {
  return withPublicApiHeaders(await handleSearchRequest(request));
}

export const OPTIONS = publicApiOptions;
export const HEAD = publicApiMethodNotAllowed;
export const POST = publicApiMethodNotAllowed;
export const PUT = publicApiMethodNotAllowed;
export const PATCH = publicApiMethodNotAllowed;
export const DELETE = publicApiMethodNotAllowed;
