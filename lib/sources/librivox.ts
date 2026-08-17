import type { NormalisedBook, Offer, Rights, SourceAdapter } from "./types.ts";

const PAGE_SIZE = 20;
const ENDPOINT = "https://librivox.org/api/feed/audiobooks/";
const USER_AGENT = "LibreLeaf/0.1 (+https://github.com/maxrobdev/libreleaf)";
const PUBLIC_DOMAIN_POLICY = "https://librivox.org/pages/public-domain/";

type LibriVoxAuthor = {
  first_name?: unknown;
  last_name?: unknown;
};

type LibriVoxBook = {
  id?: unknown;
  title?: unknown;
  authors?: unknown;
  language?: unknown;
  url_librivox?: unknown;
  url_rss?: unknown;
  url_zip_file?: unknown;
  coverart_thumbnail?: unknown;
  coverart_jpg?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function identifier(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return text(value);
}

function safeSourceUrl(value: unknown, hosts: "librivox" | "media"): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    const host = url.hostname.toLocaleLowerCase("en-GB");
    const librivox = host === "librivox.org" || host.endsWith(".librivox.org");
    const archive = host === "archive.org" || host.endsWith(".archive.org");
    if (!librivox && !(hosts === "media" && archive)) return undefined;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return undefined;
  }
}

function authorsFor(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const author = entry as LibriVoxAuthor;
    const name = [text(author.first_name), text(author.last_name)].filter(Boolean).join(" ");
    return name ? [name] : [];
  }).filter((author, index, all) => all.indexOf(author) === index).slice(0, 5);
}

function sourceRights(): Rights {
  return {
    status: "source-assessed-public-domain",
    jurisdiction: "US",
    note: "LibriVox states that its recordings and source texts are public domain in the United States. Outside the US, check the work and recording under local law before listening or downloading.",
    licenceUrl: PUBLIC_DOMAIN_POLICY,
  };
}

function bookForRecord(record: LibriVoxBook): NormalisedBook | undefined {
  const id = identifier(record.id);
  const title = text(record.title);
  const detailsUrl = safeSourceUrl(record.url_librivox, "librivox");
  if (!id || !/^\d{1,12}$/.test(id) || !title || !detailsUrl) return undefined;

  const language = text(record.language);
  const rights = sourceRights();
  const offers: Offer[] = [{
    source: "LibriVox",
    access: "listen",
    label: "Listen on LibriVox",
    url: detailsUrl,
    language,
    rights,
  }];
  const seen = new Set([detailsUrl]);
  const rss = safeSourceUrl(record.url_rss, "media");
  if (rss && !seen.has(rss)) {
    seen.add(rss);
    offers.push({
      source: "LibriVox",
      access: "listen",
      label: "LibriVox audio feed",
      url: rss,
      format: "RSS",
      language,
      rights,
    });
  }
  const zip = safeSourceUrl(record.url_zip_file, "media");
  if (zip && !seen.has(zip)) {
    offers.push({
      source: "LibriVox",
      access: "download",
      label: "Download audiobook MP3 ZIP",
      url: zip,
      format: "MP3 ZIP",
      language,
      rights,
    });
  }

  const formats = offers.flatMap((offer) => offer.access === "download" && offer.format
    ? [{ label: offer.format, url: offer.url }]
    : []);

  return {
    id: `librivox-${id}`,
    title,
    authors: authorsFor(record.authors),
    cover: safeSourceUrl(record.coverart_thumbnail, "media") ?? safeSourceUrl(record.coverart_jpg, "media"),
    source: "LibriVox",
    access: "listen",
    formats,
    detailsUrl,
    language,
    clusterConfidence: "probable",
    why: [
      "Matched an official LibriVox public-domain audiobook record.",
      "The recording is source-assessed for the United States; no UK copyright conclusion was inferred.",
    ],
    offers,
    sourceRecords: [{
      source: "LibriVox",
      recordId: id,
      detailsUrl,
      language,
      offers,
    }],
  };
}

function parsePayload(payload: unknown): LibriVoxBook[] {
  if (!isRecord(payload) || !Array.isArray(payload.books)) {
    throw new Error("LibriVox returned an invalid response.");
  }
  return payload.books.filter(isRecord) as LibriVoxBook[];
}

function boundedTotal(payload: unknown): number | null {
  if (!isRecord(payload)) return null;
  const candidate = payload.total ?? payload.num_results;
  const numeric = typeof candidate === "string" ? Number(candidate) : candidate;
  return typeof numeric === "number" && Number.isInteger(numeric) && numeric >= 0 && numeric <= 100_000_000
    ? numeric
    : null;
}

export const librivoxAdapter: SourceAdapter = {
  source: "LibriVox",
  async search(input, fetchJson) {
    const url = new URL(ENDPOINT);
    if (input.query) {
      const field = input.by === "author" ? "author" : input.by === "subject" ? "genre" : "title";
      url.searchParams.set(field, input.query);
    }
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(input.offset));
    url.searchParams.set("coverart", "1");
    url.searchParams.set("fields", "{id,title,authors,language,url_librivox,url_rss,url_zip_file,coverart_thumbnail,coverart_jpg}");

    const payload = await fetchJson(url.toString(), USER_AGENT, 1_800);
    const records = parsePayload(payload);
    const total = boundedTotal(payload);
    return {
      books: records.flatMap((record) => {
        const book = bookForRecord(record);
        return book ? [book] : [];
      }),
      total,
      hasMore: records.length > 0 && (total === null ? records.length === PAGE_SIZE : input.offset + records.length < total),
      advanceBy: PAGE_SIZE,
    };
  },
};
