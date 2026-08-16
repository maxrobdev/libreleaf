import type { NormalisedBook, Offer, Rights, SourceAdapter } from "./types.ts";

const PAGE_SIZE = 20;
const ENDPOINT = "https://www.loc.gov/books/";
const USER_AGENT = "LibreLeaf/0.1 (+https://github.com/maxrobdev/libreleaf)";

type LocResource = {
  caption?: unknown;
  pdf?: unknown;
  url?: unknown;
};

type LocItem = {
  access_restricted?: unknown;
  contributor?: unknown;
  date?: unknown;
  digitized?: unknown;
  id?: unknown;
  image_url?: unknown;
  language?: unknown;
  resources?: unknown;
  rights?: unknown;
  rights_advisory?: unknown;
  rights_information?: unknown;
  title?: unknown;
  url?: unknown;
};

type LocPagination = {
  current?: unknown;
  next?: unknown;
  of?: unknown;
  total?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function strings(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => typeof entry === "string" && entry.trim() ? [entry.trim()] : []);
}

function safeLocUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (url.hostname !== "loc.gov" && !url.hostname.endsWith(".loc.gov")) return undefined;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return undefined;
  }
}

function firstSafeLocUrl(value: unknown): string | undefined {
  return strings(value).flatMap((entry) => {
    const url = safeLocUrl(entry);
    return url ? [url] : [];
  })[0];
}

function yearFor(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return match ? Number(match[1]) : undefined;
}

function sourceRights(item: LocItem): Rights {
  const advisory = [
    ...strings(item.rights_information),
    ...strings(item.rights_advisory),
    ...strings(item.rights),
  ].filter((value, index, values) => values.indexOf(value) === index);
  const sourceNote = advisory.join(" ").replace(/\s+/g, " ").slice(0, 320);
  return {
    status: "source-provided-access",
    jurisdiction: "Not determined by the catalogue record",
    note: sourceNote
      ? `Library of Congress record: ${sourceNote} This does not establish public-domain status in the UK or elsewhere.`
      : "The Library of Congress provides this digital item, but the record does not establish public-domain status in the UK or elsewhere. Check the item record and local law.",
  };
}

function resourcesFor(item: LocItem): LocResource[] {
  if (!Array.isArray(item.resources)) return [];
  return item.resources.filter(isRecord) as LocResource[];
}

function bookForItem(item: LocItem): NormalisedBook | undefined {
  if (item.access_restricted !== false || item.digitized !== true) return undefined;
  if (typeof item.title !== "string" || !item.title.trim()) return undefined;
  const detailsUrl = safeLocUrl(item.url) ?? safeLocUrl(item.id);
  if (!detailsUrl || !new URL(detailsUrl).pathname.startsWith("/item/")) return undefined;

  const rights = sourceRights(item);
  const resources = resourcesFor(item);
  const offers: Offer[] = [];
  const seen = new Set<string>();
  for (const resource of resources) {
    const pdf = safeLocUrl(resource.pdf);
    if (pdf && !seen.has(pdf)) {
      seen.add(pdf);
      const caption = typeof resource.caption === "string" ? resource.caption.trim().slice(0, 80) : "";
      offers.push({
        source: "Library of Congress",
        access: "download",
        label: caption ? `Download PDF — ${caption}` : "Download PDF",
        url: pdf,
        format: "PDF",
        rights,
      });
    }
  }

  const readUrl = resources.flatMap((resource) => {
    const url = safeLocUrl(resource.url);
    return url ? [url] : [];
  })[0];
  if (readUrl && !seen.has(readUrl)) {
    offers.push({
      source: "Library of Congress",
      access: "read",
      label: "Read at the Library of Congress",
      url: readUrl,
      rights,
    });
  }
  if (!offers.length) return undefined;

  const recordId = new URL(detailsUrl).pathname.replace(/^\/item\//, "").replace(/\/$/, "");
  const authors = strings(item.contributor).slice(0, 5);
  const language = strings(item.language)[0];
  const formats = offers.flatMap((offer) => offer.access === "download" && offer.format
    ? [{ label: offer.format, url: offer.url }]
    : []);

  return {
    id: `loc-${recordId}`,
    title: item.title.trim(),
    authors,
    year: yearFor(item.date),
    cover: firstSafeLocUrl(item.image_url),
    source: "Library of Congress",
    access: formats.length ? "download" : "read",
    formats,
    detailsUrl,
    language,
    clusterConfidence: "probable",
    why: [
      "Matched a digitized, unrestricted Library of Congress item with an explicit access file or reader route.",
      strings(item.rights_information).length || strings(item.rights_advisory).length || strings(item.rights).length
        ? "The source record supplied rights information; no UK copyright conclusion was inferred."
        : "The source record did not supply a conclusive rights statement; local status must be checked.",
    ],
    offers,
    sourceRecords: [{
      source: "Library of Congress",
      recordId,
      detailsUrl,
      language,
      offers,
    }],
  };
}

function parsePayload(payload: unknown): { items: LocItem[]; pagination: LocPagination } {
  if (!isRecord(payload) || !Array.isArray(payload.results) || !isRecord(payload.pagination)) {
    throw new Error("Library of Congress returned an invalid response.");
  }
  return {
    items: payload.results.filter(isRecord) as LocItem[],
    pagination: payload.pagination as LocPagination,
  };
}

function boundedTotal(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100_000_000
    ? value
    : null;
}

export const libraryOfCongressAdapter: SourceAdapter = {
  source: "Library of Congress",
  async search(input, fetchJson) {
    const page = Math.floor(input.offset / PAGE_SIZE) + 1;
    const url = new URL(ENDPOINT);
    if (input.query) url.searchParams.set("q", input.query);
    url.searchParams.set("fa", "digitized:true|access-restricted:false");
    url.searchParams.set("fo", "json");
    url.searchParams.set("at", "pagination,results");
    url.searchParams.set("c", String(PAGE_SIZE));
    url.searchParams.set("sp", String(page));

    const result = parsePayload(await fetchJson(url.toString(), USER_AGENT, 3_750));
    const total = boundedTotal(result.pagination.of);
    const current = typeof result.pagination.current === "number" ? result.pagination.current : page;
    const totalPages = typeof result.pagination.total === "number" ? result.pagination.total : null;
    const hasMore = typeof result.pagination.next === "string"
      || (totalPages !== null && current < totalPages)
      || (total === null && result.items.length === PAGE_SIZE);

    return {
      books: result.items.flatMap((item) => {
        const book = bookForItem(item);
        return book ? [book] : [];
      }),
      total,
      hasMore,
      advanceBy: PAGE_SIZE,
    };
  },
};
