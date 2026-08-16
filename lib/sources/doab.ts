import type { NormalisedBook, Offer, Rights, SourceAdapter } from "./types.ts";

const PAGE_SIZE = 10;
const ENDPOINT = "https://directory.doabooks.org/rest/search";
const USER_AGENT = "LibreLeaf/0.1 (+https://github.com/maxrobdev/libreleaf)";

type Metadata = { key?: string; value?: string; code?: string };
type Bitstream = { mimeType?: string; bundleName?: string; retrieveLink?: string; metadata?: Metadata[] };
type DoabItem = {
  uuid?: string;
  name?: string;
  handle?: string;
  metadata?: Metadata[];
  bitstreams?: Bitstream[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeHttps(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return undefined;
  }
}

function values(metadata: Metadata[] | undefined, key: string) {
  return (metadata ?? []).flatMap((entry) => entry.key === key && typeof entry.value === "string" ? [entry.value.trim()] : []).filter(Boolean);
}

function firstValue(metadata: Metadata[] | undefined, key: string) {
  return values(metadata, key)[0];
}

function queryExpression(query: string, by: "q" | "title" | "author" | "subject") {
  if (!query) return "dc.type:book";
  const unsafe = new Set(["+", "-", "&", "|", "!", "(", ")", "{", "}", "[", "]", "^", '"', "~", "*", "?", ":", "\\", "/"]);
  const cleaned = [...query].map((character) => unsafe.has(character) ? " " : character).join("");
  const terms = cleaned.split(/\s+/).filter(Boolean).slice(0, 12);
  const expression = terms.map((term) => `"${term}"`).join(" AND ");
  const field = by === "title"
    ? "dc.title"
    : by === "author"
      ? "dc.contributor.author"
      : by === "subject"
        ? "dc.subject"
        : undefined;
  return field ? `${field}:(${expression})` : expression;
}

function formatFor(url: string) {
  const pathname = new URL(url).pathname.toLocaleLowerCase();
  if (pathname.endsWith(".pdf")) return "PDF";
  if (pathname.endsWith(".epub")) return "EPUB";
  return undefined;
}

function allBitstreamMetadata(item: DoabItem) {
  return (item.bitstreams ?? []).flatMap((bitstream) => bitstream.metadata ?? []);
}

function bookForItem(item: DoabItem): NormalisedBook | undefined {
  if (typeof item.uuid !== "string") return undefined;
  const metadata = item.metadata ?? [];
  const title = firstValue(metadata, "dc.title") ?? item.name;
  if (!title) return undefined;
  const detailsUrl = safeHttps(firstValue(metadata, "dc.identifier.uri"))
    ?? (item.handle ? `https://directory.doabooks.org/handle/${item.handle}` : undefined);
  if (!detailsUrl) return undefined;

  const bitstreamMetadata = allBitstreamMetadata(item);
  const licenceUrl = safeHttps(firstValue(metadata, "dc.rights.uri") ?? firstValue(bitstreamMetadata, "dc.rights.uri"));
  const downloadUrl = safeHttps(firstValue(metadata, "oapen.identifier.downloadUrl") ?? firstValue(bitstreamMetadata, "oapen.identifier.downloadUrl"));
  const directFormat = downloadUrl ? formatFor(downloadUrl) : undefined;
  const languageEntry = metadata.find((entry) => entry.key === "dc.language");
  const language = languageEntry?.value?.trim() || languageEntry?.code;
  const country = firstValue(metadata, "publisher.country");
  const yearValue = firstValue(metadata, "dc.date.issued")?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/)?.[0];
  const year = yearValue ? Number(yearValue) : undefined;
  const rights: Rights = {
    status: "open-licence",
    jurisdiction: country ? `Publisher country: ${country}` : "Publisher-supplied open licence",
    note: licenceUrl
      ? "DOAB lists this edition as open access under the linked publisher-supplied licence. Licence conditions apply."
      : "DOAB lists this edition as open access. Check the source record for the publisher's licence and reuse conditions.",
    licenceUrl,
  };
  const offerUrl = downloadUrl ?? detailsUrl;
  const access = directFormat ? "download" as const : "read" as const;
  const offer: Offer = {
    source: "DOAB",
    access,
    label: directFormat ? `Download ${directFormat}` : "Open-access edition",
    url: offerUrl,
    format: directFormat,
    language,
    rights,
  };
  const coverSource = (item.bitstreams ?? []).find((stream) => stream.bundleName === "THUMBNAIL");
  const cover = coverSource?.retrieveLink
    ? safeHttps(`https://directory.doabooks.org${coverSource.retrieveLink}`)
    : undefined;

  return {
    id: `doab-${item.uuid}`,
    title,
    authors: values(metadata, "dc.contributor.author").slice(0, 5),
    year,
    cover,
    source: "DOAB",
    access,
    formats: directFormat && downloadUrl ? [{ label: directFormat, url: downloadUrl }] : [],
    detailsUrl,
    language,
    country,
    clusterConfidence: "probable",
    why: [
      `Matched a Directory of Open Access Books record${language ? ` in ${language}` : ""}.`,
      licenceUrl ? "The catalogue supplied a licence URL for this edition." : "The source record should be checked for edition-specific licence terms.",
    ],
    offers: [offer],
    sourceRecords: [{
      source: "DOAB",
      recordId: item.handle ?? item.uuid,
      detailsUrl,
      language,
      country,
      offers: [offer],
    }],
  };
}

export const doabAdapter: SourceAdapter = {
  source: "DOAB",
  async search(input, fetchJson) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("query", queryExpression(input.query, input.by));
    url.searchParams.set("expand", "metadata,bitstreams");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(input.offset));
    // DOAB currently has intermittent zero-byte connection stalls from the
    // production edge. Keep it independent and retryable without holding the
    // whole resolver response beyond the fast-source budget.
    const payload = await fetchJson(url.toString(), USER_AGENT, 2_500);
    if (!Array.isArray(payload) || payload.some((item) => !isRecord(item))) {
      throw new Error("DOAB returned an invalid response.");
    }
    const items = payload as DoabItem[];
    return {
      books: items.flatMap((item) => {
        const book = bookForItem(item);
        return book ? [book] : [];
      }),
      total: null,
      hasMore: items.length === PAGE_SIZE,
      advanceBy: PAGE_SIZE,
    };
  },
};
