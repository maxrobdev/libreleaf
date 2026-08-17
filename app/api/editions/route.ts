import { publicApiMethodNotAllowed, publicApiOptions, withPublicApiHeaders } from "../../../lib/public-api.ts";

const OPEN_LIBRARY_ORIGIN = "https://openlibrary.org";
const EDITION_LIMIT = 12;
const REQUEST_TIMEOUT_MS = 5_000;
const APP_USER_AGENT = "LibreLeaf/0.1 (+https://github.com/maxrobdev/libreleaf)";

const successHeaders = {
  "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
  "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=86400, stale-while-revalidate=604800",
};

const errorHeaders = { "Cache-Control": "no-store" };

const LANGUAGE_NAMES: Record<string, string> = {
  ara: "Arabic",
  chi: "Chinese",
  cym: "Welsh",
  dan: "Danish",
  deu: "German",
  dut: "Dutch",
  eng: "English",
  fin: "Finnish",
  fra: "French",
  fre: "French",
  ger: "German",
  gle: "Irish",
  gre: "Greek",
  heb: "Hebrew",
  hin: "Hindi",
  ita: "Italian",
  jpn: "Japanese",
  lat: "Latin",
  nld: "Dutch",
  nor: "Norwegian",
  pol: "Polish",
  por: "Portuguese",
  rus: "Russian",
  spa: "Spanish",
  swe: "Swedish",
  zho: "Chinese",
};

export type EditionLanguage = {
  code: string;
  name?: string;
};

export type EditionAccessLink = {
  kind: "catalogue" | "availability";
  label: string;
  url: string;
  source: "Open Library" | "Internet Archive";
  availability: "not-checked";
};

export type NormalisedEdition = {
  key: string;
  title: string;
  publishDate?: string;
  publishYear?: number;
  languages: EditionLanguage[];
  isbn10: string[];
  isbn13: string[];
  publishers: string[];
  physicalFormat?: string;
  numberOfPages?: number;
  accessLinks: EditionAccessLink[];
  rights: {
    status: "not-assessed";
    note: string;
  };
  provenance: {
    source: "Open Library";
    workKey: string;
    editionKey: string;
    recordUrl: string;
    apiRecordUrl: string;
  };
};

export type EditionsPayload = {
  workKey: string;
  total: number;
  returned: number;
  partial: boolean;
  limit: number;
  editions: NormalisedEdition[];
  provenance: {
    source: "Open Library";
    workUrl: string;
    editionsApiUrl: string;
    fetchedAt: string;
  };
};

class UpstreamError extends Error {
  constructor(readonly kind: "timeout" | "rate-limited" | "not-found" | "unavailable") {
    super(kind);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanText(value: unknown, maxLength = 300) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanTextArray(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 180))
    .filter((item, index, all) => Boolean(item) && all.indexOf(item) === index)
    .slice(0, limit);
}

function editionKey(value: unknown) {
  const key = cleanText(value, 40);
  return /^\/books\/OL[1-9]\d*M$/.test(key) ? key : "";
}

export function isValidWorkKey(value: string) {
  return /^\/works\/OL[1-9]\d*W$/.test(value);
}

function normaliseLanguages(value: unknown): EditionLanguage[] {
  if (!Array.isArray(value)) return [];
  const codes = value
    .map((language) => {
      if (typeof language === "string") return language;
      if (!isRecord(language)) return "";
      return cleanText(language.key, 40).replace(/^\/languages\//, "");
    })
    .map((code) => code.toLowerCase())
    .filter((code) => /^[a-z]{2,8}$/.test(code))
    .filter((code, index, all) => all.indexOf(code) === index)
    .slice(0, 8);

  return codes.map((code) => ({ code, name: LANGUAGE_NAMES[code] }));
}

function normaliseIsbn(value: unknown, length: 10 | 13) {
  if (!Array.isArray(value)) return [];
  const pattern = length === 10 ? /^\d{9}[\dX]$/ : /^\d{13}$/;
  return value
    .map((isbn) => String(isbn).replace(/[\s-]/g, "").toUpperCase())
    .filter((isbn) => pattern.test(isbn))
    .filter((isbn, index, all) => all.indexOf(isbn) === index)
    .slice(0, 8);
}

function publishYear(value: Record<string, unknown>) {
  if (typeof value.publish_year === "number" && Number.isInteger(value.publish_year) && value.publish_year >= 1000 && value.publish_year <= 2199) {
    return value.publish_year;
  }
  const date = cleanText(value.publish_date, 80);
  const match = date.match(/(?:^|\D)(1\d{3}|20\d{2}|21\d{2})(?:\D|$)/);
  return match ? Number(match[1]) : undefined;
}

function archiveIds(value: Record<string, unknown>) {
  const candidates = [value.ocaid, ...(Array.isArray(value.ocaids) ? value.ocaids : []), ...(Array.isArray(value.ia) ? value.ia : [])];
  return candidates
    .map((id) => cleanText(id, 160))
    .filter((id) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id))
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(0, 3);
}

export function normaliseEdition(value: unknown, workKey: string): NormalisedEdition | null {
  if (!isRecord(value)) return null;
  const key = editionKey(value.key);
  if (!key) return null;

  const recordUrl = `${OPEN_LIBRARY_ORIGIN}${key}`;
  const accessLinks: EditionAccessLink[] = [{
    kind: "catalogue",
    label: "Check edition availability",
    url: recordUrl,
    source: "Open Library",
    availability: "not-checked",
  }];
  for (const identifier of archiveIds(value)) {
    accessLinks.push({
      kind: "availability",
      label: "Check readable scan",
      url: `https://archive.org/details/${encodeURIComponent(identifier)}`,
      source: "Internet Archive",
      availability: "not-checked",
    });
  }

  const pages = typeof value.number_of_pages === "number" && Number.isInteger(value.number_of_pages) && value.number_of_pages > 0 && value.number_of_pages < 100_000
    ? value.number_of_pages
    : undefined;

  return {
    key,
    title: cleanText(value.title) || "Untitled edition",
    publishDate: cleanText(value.publish_date, 80) || undefined,
    publishYear: publishYear(value),
    languages: normaliseLanguages(value.languages),
    isbn10: normaliseIsbn(value.isbn_10, 10),
    isbn13: normaliseIsbn(value.isbn_13, 13),
    publishers: cleanTextArray(value.publishers, 8),
    physicalFormat: cleanText(value.physical_format, 80) || undefined,
    numberOfPages: pages,
    accessLinks,
    rights: {
      status: "not-assessed",
      note: "Catalogue and availability links only. LibreLeaf has not assessed rights for this edition.",
    },
    provenance: {
      source: "Open Library",
      workKey,
      editionKey: key,
      recordUrl,
      apiRecordUrl: `${recordUrl}.json`,
    },
  };
}

async function fetchEditions(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": APP_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) throw new UpstreamError("not-found");
    if (response.status === 429) throw new UpstreamError("rate-limited");
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

function errorResponse(status: number, error: string, message: string) {
  return Response.json({ error, message }, { status, headers: errorHeaders });
}

async function handleEditionsRequest(request: Request) {
  const url = new URL(request.url);
  const workKeys = url.searchParams.getAll("workKey");
  const workKey = workKeys[0] ?? "";
  if (workKeys.length !== 1 || !isValidWorkKey(workKey)) {
    return errorResponse(400, "invalid_work_key", "Use a canonical Open Library work key such as /works/OL45804W.");
  }

  const editionsApiUrl = `${OPEN_LIBRARY_ORIGIN}${workKey}/editions.json?limit=${EDITION_LIMIT}`;
  try {
    const data = await fetchEditions(editionsApiUrl);
    if (!isRecord(data) || !Array.isArray(data.entries)) {
      return errorResponse(502, "invalid_upstream_response", "Open Library returned an unexpected editions response.");
    }

    const editions = data.entries
      .slice(0, EDITION_LIMIT)
      .map((entry) => normaliseEdition(entry, workKey))
      .filter((entry): entry is NormalisedEdition => entry !== null);
    const reportedSize = typeof data.size === "number" && Number.isInteger(data.size) && data.size >= 0 ? data.size : data.entries.length;
    const total = Math.max(reportedSize, editions.length);
    const payload: EditionsPayload = {
      workKey,
      total,
      returned: editions.length,
      partial: total > editions.length || data.entries.length > EDITION_LIMIT,
      limit: EDITION_LIMIT,
      editions,
      provenance: {
        source: "Open Library",
        workUrl: `${OPEN_LIBRARY_ORIGIN}${workKey}`,
        editionsApiUrl,
        fetchedAt: new Date().toISOString(),
      },
    };
    return Response.json(payload, { headers: successHeaders });
  } catch (error) {
    if (error instanceof UpstreamError && error.kind === "not-found") {
      return errorResponse(404, "work_not_found", "Open Library did not find this work.");
    }
    if (error instanceof UpstreamError && error.kind === "rate-limited") {
      return errorResponse(503, "source_rate_limited", "Open Library is rate-limiting edition requests. Try again shortly.");
    }
    if (error instanceof UpstreamError && error.kind === "timeout") {
      return errorResponse(504, "source_timeout", "Open Library did not respond in time. Try again.");
    }
    return errorResponse(502, "source_unavailable", "Open Library editions are temporarily unavailable.");
  }
}

export async function GET(request: Request) {
  return withPublicApiHeaders(await handleEditionsRequest(request));
}

export const OPTIONS = publicApiOptions;
export const HEAD = publicApiMethodNotAllowed;
export const POST = publicApiMethodNotAllowed;
export const PUT = publicApiMethodNotAllowed;
export const PATCH = publicApiMethodNotAllowed;
export const DELETE = publicApiMethodNotAllowed;
