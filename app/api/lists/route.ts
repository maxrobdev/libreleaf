import { publicApiMethodNotAllowed, publicApiOptions, withPublicApiHeaders } from "../../../lib/public-api.ts";

type SourceState = "live" | "stale" | "unavailable";

type LiveListItem = {
  id: string;
  title: string;
  authors: string[];
  cover?: string;
  publishedAt?: string;
  sourceUrl: string;
  actionUrl: string;
  actionLabel: string;
  access: "download" | "borrow-preview";
  metric?: { label: string; value: number };
  rights: { jurisdiction: "US" | "varies"; note: string };
};

type LiveList = {
  id: "gutenberg-popular" | "standard-ebooks-new" | "open-library-trending";
  title: string;
  description: string;
  source: {
    name: string;
    url: string;
    documentation: string;
  };
  state: SourceState;
  updatedAt: string;
  items: LiveListItem[];
  error?: string;
};

export type LiveListsPayload = {
  generatedAt: string;
  refreshAfterSeconds: number;
  partial: boolean;
  lists: LiveList[];
};

type GutendexBook = {
  id?: number;
  title?: string;
  authors?: { name?: string }[];
  formats?: Record<string, string>;
  copyright?: boolean;
  download_count?: number;
};

type OpenLibraryWork = {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
};

const REFRESH_SECONDS = 15 * 60;
const STALE_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 6_000;
const OPEN_LIBRARY_TIMEOUT_MS = 2_500;
const ITEM_LIMIT = 12;
const APP_USER_AGENT = "LibreLeaf/0.1 (+https://github.com/maxrobdev/libreleaf)";

const successHeaders = {
  "Cache-Control": `public, max-age=60, s-maxage=${REFRESH_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
  "CDN-Cache-Control": `public, s-maxage=${REFRESH_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
  "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${REFRESH_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
};

let memoryCache: { expiresAt: number; payload: LiveListsPayload } | null = null;

class SourceError extends Error {
  constructor(readonly kind: "timeout" | "rate-limited" | "unavailable") {
    super(kind);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeHttpsUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

async function fetchSource(url: string, responseType: "json" | "text", accept: string, timeout = REQUEST_TIMEOUT_MS): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { Accept: accept, "User-Agent": APP_USER_AGENT },
      signal: AbortSignal.timeout(timeout),
    });
    if (response.status === 429) throw new SourceError("rate-limited");
    if (!response.ok) throw new SourceError("unavailable");
    return responseType === "json" ? response.json() : response.text();
  } catch (error) {
    if (error instanceof SourceError) throw error;
    if (isRecord(error) && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new SourceError("timeout");
    }
    throw new SourceError("unavailable");
  }
}

function errorMessage(error: unknown) {
  if (error instanceof SourceError && error.kind === "timeout") return "The source timed out; its other lists are still current.";
  if (error instanceof SourceError && error.kind === "rate-limited") return "The source is rate-limiting requests; try again later.";
  return "The source is temporarily unavailable.";
}

function gutenbergList(value: unknown, now: string): LiveList {
  const results = isRecord(value) && Array.isArray(value.results) ? value.results : [];
  const items = results
    .filter((entry): entry is GutendexBook => isRecord(entry) && entry.copyright === false)
    .map((entry) => {
      const formats = isRecord(entry.formats) ? entry.formats as Record<string, string> : {};
      const epub = safeHttpsUrl(formats["application/epub+zip"]);
      const readOnline = safeHttpsUrl(formats["text/html"]);
      const sourceUrl = typeof entry.id === "number" ? `https://www.gutenberg.org/ebooks/${entry.id}` : readOnline;
      if (!entry.id || !entry.title || !sourceUrl || (!epub && !readOnline)) return null;
      const downloadCount = typeof entry.download_count === "number" ? entry.download_count : undefined;
      return {
        id: `gutenberg-${entry.id}`,
        title: entry.title,
        authors: entry.authors?.map((author) => author.name).filter((name): name is string => Boolean(name)) ?? [],
        cover: safeHttpsUrl(formats["image/jpeg"]) || undefined,
        sourceUrl,
        actionUrl: epub || readOnline,
        actionLabel: epub ? "Download EPUB" : "Read online",
        access: "download" as const,
        metric: downloadCount === undefined ? undefined : { label: "downloads (30 days)", value: downloadCount },
        rights: {
          jurisdiction: "US" as const,
          note: "Project Gutenberg assesses this edition as public domain in the US. Check the law where you are.",
        },
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, ITEM_LIMIT);

  if (!items.length) throw new SourceError("unavailable");
  return {
    id: "gutenberg-popular",
    title: "Popular downloads",
    description: "Project Gutenberg files ordered by recent download count.",
    source: {
      name: "Gutendex / Project Gutenberg",
      url: "https://gutendex.com/books?sort=popular",
      documentation: "https://gutendex.com/",
    },
    state: "live",
    updatedAt: now,
    items,
  };
}

function xmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .trim();
}

function tag(entry: string, name: string) {
  const match = entry.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? xmlText(match[1]) : "";
}

function attribute(entry: string, tagPattern: string, attributeName: string) {
  const match = entry.match(new RegExp(`<${tagPattern}\\b[^>]*\\b${attributeName}="([^"]+)"[^>]*/?>`, "i"));
  return match ? xmlText(match[1]) : "";
}

export function parseStandardEbooksFeed(value: string, now: string): LiveList {
  const entries = value.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];
  const feedUpdatedAt = tag(value.split("<entry>")[0] ?? value, "updated") || now;
  const items = entries.map((entry) => {
    const sourceUrl = safeHttpsUrl(attribute(entry, "link(?=[^>]*rel=\"alternate\")", "href") || tag(entry, "id"));
    const epub = safeHttpsUrl(attribute(entry, "link(?=[^>]*rel=\"enclosure\")(?=[^>]*type=\"application/epub\\+zip\")", "href"));
    const title = tag(entry, "title");
    if (!title || !sourceUrl || !epub) return null;
    return {
      id: `standard-${sourceUrl.split("/").filter(Boolean).slice(-3).join("-")}`,
      title,
      authors: [tag(entry, "name")].filter(Boolean),
      cover: safeHttpsUrl(attribute(entry, "media:thumbnail", "url")) || undefined,
      publishedAt: tag(entry, "published"),
      sourceUrl,
      actionUrl: epub,
      actionLabel: "Download EPUB",
      access: "download" as const,
      rights: {
        jurisdiction: "US" as const,
        note: tag(entry, "rights") || "This edition is assessed as public domain in the US. Check the law where you are.",
      },
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null).slice(0, ITEM_LIMIT);

  if (!items.length) throw new SourceError("unavailable");
  return {
    id: "standard-ebooks-new",
    title: "Newly released editions",
    description: "The latest hand-produced editions published by Standard Ebooks.",
    source: {
      name: "Standard Ebooks",
      url: "https://standardebooks.org/feeds/atom/new-releases",
      documentation: "https://standardebooks.org/feeds",
    },
    state: "live",
    updatedAt: feedUpdatedAt,
    items,
  };
}

function openLibraryList(value: unknown, now: string): LiveList {
  const works = isRecord(value) && Array.isArray(value.works) ? value.works : [];
  const items = works.map((entry) => {
    if (!isRecord(entry)) return null;
    const work = entry as OpenLibraryWork;
    if (!work.key || !work.title) return null;
    const workKey = work.key.startsWith("/") ? work.key : `/works/${work.key}`;
    const sourceUrl = `https://openlibrary.org${workKey}`;
    return {
      id: `openlibrary-${workKey.split("/").pop()}`,
      title: work.title,
      authors: work.author_name?.filter(Boolean) ?? [],
      cover: work.cover_i ? `https://covers.openlibrary.org/b/id/${work.cover_i}-M.jpg` : undefined,
      publishedAt: work.first_publish_year ? String(work.first_publish_year) : undefined,
      sourceUrl,
      actionUrl: sourceUrl,
      actionLabel: "Check availability",
      access: "borrow-preview" as const,
      rights: {
        jurisdiction: "varies" as const,
        note: "This is a catalogue and availability route, not a public-domain claim. Borrowing and preview options vary by edition and location.",
      },
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null).slice(0, ITEM_LIMIT);

  if (!items.length) throw new SourceError("unavailable");
  return {
    id: "open-library-trending",
    title: "Trending at Open Library",
    description: "Works currently attracting reader activity; lending and previews vary by edition.",
    source: {
      name: "Open Library",
      url: "https://openlibrary.org/trending/daily",
      documentation: "https://openlibrary.org/developers/api",
    },
    state: "live",
    updatedAt: now,
    items,
  };
}

function unavailableList(id: LiveList["id"], now: string, error: unknown): LiveList {
  const definitions = {
    "gutenberg-popular": {
      title: "Popular downloads",
      description: "Project Gutenberg files ordered by recent download count.",
      name: "Gutendex / Project Gutenberg",
      url: "https://gutendex.com/books?sort=popular",
      documentation: "https://gutendex.com/",
    },
    "standard-ebooks-new": {
      title: "Newly released editions",
      description: "The latest hand-produced editions published by Standard Ebooks.",
      name: "Standard Ebooks",
      url: "https://standardebooks.org/feeds/atom/new-releases",
      documentation: "https://standardebooks.org/feeds",
    },
    "open-library-trending": {
      title: "Trending at Open Library",
      description: "Works currently attracting reader activity; lending and previews vary by edition.",
      name: "Open Library",
      url: "https://openlibrary.org/trending/daily",
      documentation: "https://openlibrary.org/developers/api",
    },
  }[id];
  return {
    id,
    title: definitions.title,
    description: definitions.description,
    source: { name: definitions.name, url: definitions.url, documentation: definitions.documentation },
    state: "unavailable",
    updatedAt: now,
    items: [],
    error: errorMessage(error),
  };
}

function recoverStale(list: LiveList, previous: LiveListsPayload | null) {
  if (list.state !== "unavailable" || !previous) return list;
  const cached = previous.lists.find((candidate) => candidate.id === list.id && candidate.items.length);
  if (!cached) return list;
  return { ...cached, state: "stale" as const, error: list.error };
}

async function buildPayload(previous: LiveListsPayload | null): Promise<LiveListsPayload> {
  const now = new Date().toISOString();
  const [gutenberg, standardEbooks, openLibrary] = await Promise.allSettled([
    fetchSource("https://gutendex.com/books?sort=popular", "json", "application/json").then((value) => gutenbergList(value, now)),
    fetchSource("https://standardebooks.org/feeds/atom/new-releases", "text", "application/atom+xml").then((value) => parseStandardEbooksFeed(String(value), now)),
    fetchSource("https://openlibrary.org/trending/daily.json?limit=24", "json", "application/json", OPEN_LIBRARY_TIMEOUT_MS).then((value) => openLibraryList(value, now)),
  ]);

  const settled: [PromiseSettledResult<LiveList>, LiveList["id"]][] = [
    [gutenberg, "gutenberg-popular"],
    [standardEbooks, "standard-ebooks-new"],
    [openLibrary, "open-library-trending"],
  ];
  const lists = settled.map(([result, id]) => recoverStale(
    result.status === "fulfilled" ? result.value : unavailableList(id, now, result.reason),
    previous,
  ));
  return {
    generatedAt: now,
    refreshAfterSeconds: REFRESH_SECONDS,
    partial: lists.some((list) => list.state !== "live"),
    lists,
  };
}

async function handleListsRequest() {
  const now = Date.now();
  if (memoryCache && memoryCache.expiresAt > now) {
    return Response.json(memoryCache.payload, { headers: successHeaders });
  }

  const payload = await buildPayload(memoryCache?.payload ?? null);
  memoryCache = { expiresAt: now + REFRESH_SECONDS * 1_000, payload };
  return Response.json(payload, { headers: successHeaders });
}

export async function GET() {
  return withPublicApiHeaders(await handleListsRequest());
}

export const OPTIONS = publicApiOptions;
export const HEAD = publicApiMethodNotAllowed;
export const POST = publicApiMethodNotAllowed;
export const PUT = publicApiMethodNotAllowed;
export const PATCH = publicApiMethodNotAllowed;
export const DELETE = publicApiMethodNotAllowed;
