import { doabAdapter } from "../../../lib/sources/doab.ts";
import type {
  Access,
  NormalisedBook,
  Offer,
  Rights,
  RightsRegion,
  SearchMode,
  SourcePage,
  SourceRecord,
} from "../../../lib/sources/types.ts";
import { wikisourceAdapter } from "../../../lib/sources/wikisource.ts";

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

type SourceStatus = "ok" | "unavailable" | "timeout" | "rate-limited" | "exhausted";

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

const GUTENDEX_PAGE_SIZE = 32;
const OPEN_LIBRARY_PAGE_SIZE = 32;
const MAX_PAGE = 10_000;
const MAX_OPEN_LIBRARY_OFFSET = (MAX_PAGE - 1) * OPEN_LIBRARY_PAGE_SIZE;
const MAX_ADAPTER_OFFSET = 500_000;
const MAX_CURSOR_LENGTH = 256;
const MAX_UPSTREAM_TOTAL = 100_000_000;
const UPSTREAM_TIMEOUT_MS = 6_000;
const OPEN_LIBRARY_TIMEOUT_MS = 4_000;
const OPEN_LIBRARY_RETRY_TIMEOUT_MS = 2_000;
const OPEN_LIBRARY_RETRY_PAGE_SIZE = 16;
const OPEN_LIBRARY_FIELDS = "key,title,author_name,first_publish_year,cover_i,ebook_access";

const successCacheHeaders = {
  "Cache-Control": "public, max-age=60, s-maxage=900, stale-while-revalidate=86400",
  "CDN-Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=1800, stale-while-revalidate=86400",
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
  constructor(readonly kind: "timeout" | "rate-limited" | "transient" | "unavailable") {
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
  return value === "title" || value === "author" || value === "subject" ? value : "q";
}

function rightsRegion(value: string | null): RightsRegion {
  return value === "US" || value === "GLOBAL" ? value : "GB";
}

function initialCursor(pageValue: string | null): CursorState {
  if (pageValue === null || pageValue === "") {
    return { v: 1, g: 1, o: 0, gd: false, od: false, gt: null, ot: null, w: 0, d: 0, wd: false, dd: false, wt: null, dt: null };
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
    if (!boundedInteger(w, 0, MAX_ADAPTER_OFFSET) || !boundedInteger(d, 0, MAX_ADAPTER_OFFSET)) {
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

async function fetchGutendex(url: string): Promise<GutendexPage> {
  const payload = await fetchJson(url);
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

async function fetchOpenLibrary(url: string, timeout = OPEN_LIBRARY_TIMEOUT_MS): Promise<OpenLibraryPage> {
  const payload = await fetchJson(
    url,
    "LibreLeaf/0.1 (+https://github.com/maxrobdev/libreleaf)",
    timeout,
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

function isRetryableOpenLibraryError(error: unknown) {
  return error instanceof UpstreamError
    && (error.kind === "timeout" || error.kind === "rate-limited" || error.kind === "transient");
}

async function fetchOpenLibraryWithRetry(url: string, gutenbergIsAvailable: () => Promise<boolean>) {
  try {
    return await fetchOpenLibrary(url);
  } catch (error) {
    if (!isRetryableOpenLibraryError(error)) throw error;
    // Avoid extending an already fully failed request. Once Gutenberg has
    // settled, make one smaller, shorter retry for transient OL failures.
    if (!await gutenbergIsAvailable()) throw error;
    const retryUrl = new URL(url);
    retryUrl.searchParams.set("limit", String(OPEN_LIBRARY_RETRY_PAGE_SIZE));
    return fetchOpenLibrary(retryUrl.toString(), OPEN_LIBRARY_RETRY_TIMEOUT_MS);
  }
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
  ).sort((a, b) => formatRanks[a.label] - formatRanks[b.label]);
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
) {
  const next = { ...current };

  if (gutenbergResult?.status === "fulfilled") {
    next.gt = gutenbergResult.value.total ?? next.gt;
    next.gd = !gutenbergResult.value.hasMore || current.g >= MAX_PAGE;
    if (!next.gd) next.g = current.g + 1;
  }
  if (libraryResult?.status === "fulfilled") {
    next.ot = libraryResult.value.total ?? next.ot;
    next.od = !libraryResult.value.hasMore || current.o >= MAX_OPEN_LIBRARY_OFFSET;
    if (!next.od) next.o = current.o + libraryResult.value.pageSize;
  }
  if (wikisourceResult?.status === "fulfilled") {
    next.wt = wikisourceResult.value.total ?? next.wt;
    next.wd = !wikisourceResult.value.hasMore || current.w >= MAX_ADAPTER_OFFSET;
    if (!next.wd) next.w = current.w + wikisourceResult.value.advanceBy;
  }
  if (doabResult?.status === "fulfilled") {
    next.dt = doabResult.value.total ?? next.dt;
    next.dd = !doabResult.value.hasMore || current.d >= MAX_ADAPTER_OFFSET;
    if (!next.dd) next.d = current.d + doabResult.value.advanceBy;
  }

  return next;
}

function sourceStatus(done: boolean, result: PromiseSettledResult<unknown> | undefined): SourceStatus {
  if (done) return "exhausted";
  if (result?.status === "fulfilled") return "ok";
  if (result?.status === "rejected" && result.reason instanceof UpstreamError) {
    if (result.reason.kind === "timeout") return "timeout";
    if (result.reason.kind === "rate-limited") return "rate-limited";
  }
  return "unavailable";
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.trim().slice(0, 120) ?? "";
    const by = searchMode(params.get("by"));
    const region = rightsRegion(params.get("region"));
    const cursor = params.has("cursor")
      ? decodeCursor(params.get("cursor") ?? "")
      : initialCursor(params.get("page"));
    const urls = buildCatalogueUrls(query, by, cursor);

    let gutenbergAvailable = cursor.gd;
    const gutenbergPromise = cursor.gd
      ? undefined
      : fetchGutendex(urls.gutendex).then((page) => {
        gutenbergAvailable = true;
        return page;
      });
    const libraryPromise = cursor.od
      ? undefined
      : fetchOpenLibraryWithRetry(urls.openLibrary, async () => {
        if (gutenbergAvailable || !gutenbergPromise) return true;
        return Promise.race([
          gutenbergPromise.then(() => true, () => false),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
        ]);
      });
    const wikisourcePromise = cursor.wd
      ? undefined
      : wikisourceAdapter.search({ query, by, offset: cursor.w, region }, fetchJson);
    const doabPromise = cursor.dd
      ? undefined
      : doabAdapter.search({ query, by, offset: cursor.d, region }, fetchJson);
    const pending = [gutenbergPromise, libraryPromise, wikisourcePromise, doabPromise]
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
      ? settled[settledIndex] as PromiseSettledResult<SourcePage>
      : undefined;

    for (const [source, result] of [
      ["gutenberg", gutenbergResult],
      ["open-library", libraryResult],
      ["wikisource", wikisourceResult],
      ["doab", doabResult],
    ] as const) {
      if (result?.status !== "rejected") continue;
      const reason = result.reason;
      const failure = reason instanceof UpstreamError ? reason.kind : reason instanceof Error ? reason.message : "unknown";
      console.warn(`[search] ${source} upstream failure: ${failure}`);
    }

    const attempted = [gutenbergResult, libraryResult, wikisourceResult, doabResult].filter(Boolean);
    if (attempted.length && attempted.every((result) => result?.status === "rejected")) {
      const sources = {
        gutenberg: sourceStatus(cursor.gd, gutenbergResult),
        openLibrary: sourceStatus(cursor.od, libraryResult),
        wikisource: sourceStatus(cursor.wd, wikisourceResult),
        doab: sourceStatus(cursor.dd, doabResult),
      };
      return Response.json(
        { error: "Catalogues are temporarily unavailable.", sources },
        { status: 502, headers: errorCacheHeaders },
      );
    }

    const gutenbergBooks = normaliseGutenbergBooks(
      gutenbergResult?.status === "fulfilled" ? gutenbergResult.value.books : [],
    );
    const libraryBooks = normaliseOpenLibraryBooks(
      libraryResult?.status === "fulfilled" ? libraryResult.value.books : [],
    );
    const wikisourceBooks = wikisourceResult?.status === "fulfilled" ? wikisourceResult.value.books : [];
    const doabBooks = doabResult?.status === "fulfilled" ? doabResult.value.books : [];
    const books = applyRightsContext(
      clusterBooks([...gutenbergBooks, ...libraryBooks, ...wikisourceBooks, ...doabBooks]),
      region,
    );
    const next = advanceCursor(cursor, gutenbergResult, libraryResult, wikisourceResult, doabResult);
    const nextCursor = next.gd && next.od && next.wd && next.dd ? null : encodeCursor(next);

    return Response.json({
      query,
      books,
      counts: {
        total: books.length,
        download: books.filter((book) => book.access === "download").length,
        borrow: books.filter((book) => book.access === "borrow").length,
        preview: books.filter((book) => book.access === "preview").length,
        read: books.filter((book) => book.access === "read").length,
        listen: books.filter((book) => book.access === "listen").length,
      },
      nextCursor,
      upstreamTotals: {
        gutenberg: next.gt,
        openLibrary: next.ot,
        wikisource: next.wt,
        doab: next.dt,
      },
      sources: {
        gutenberg: sourceStatus(cursor.gd, gutenbergResult),
        openLibrary: sourceStatus(cursor.od, libraryResult),
        wikisource: sourceStatus(cursor.wd, wikisourceResult),
        doab: sourceStatus(cursor.dd, doabResult),
      },
      rightsContext: rightsContext(region),
    }, { headers: successCacheHeaders });
  } catch (error) {
    const isRequestError = error instanceof SearchRequestError;
    return Response.json(
      { error: isRequestError ? error.message : "The search request could not be processed." },
      { status: 400, headers: errorCacheHeaders },
    );
  }
}
