import type { NormalisedBook, SourceAdapter } from "./types.ts";

const PAGE_SIZE = 16;
const ENDPOINT = "https://en.wikisource.org/w/api.php";
const USER_AGENT = "LibreLeaf/0.1 (+https://github.com/maxrobdev/libreleaf)";

type WikiPage = {
  pageid?: number;
  ns?: number;
  title?: string;
  fullurl?: string;
  pagelanguage?: string;
  categories?: Array<{ ns?: number; title?: string }>;
  pageprops?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function searchExpression(query: string, by: "q" | "title" | "author" | "subject") {
  if (!query) return "incategory:\"Featured texts\"";
  const unsafe = new Set(["[", "]", "{", "}", "<", ">", "|"]);
  const cleaned = [...query].map((character) => unsafe.has(character) ? " " : character).join("").trim();
  return by === "title" ? `intitle:"${cleaned.replaceAll('"', " ")}"` : cleaned;
}

function normalisePages(payload: unknown): { pages: WikiPage[]; total: number | null; nextOffset: number | null } {
  if (!isRecord(payload) || !isRecord(payload.query) || !Array.isArray(payload.query.pages)) {
    throw new Error("Wikisource returned an invalid response.");
  }
  const searchInfo = isRecord(payload.query.searchinfo) ? payload.query.searchinfo : undefined;
  const total = typeof searchInfo?.totalhits === "number" && Number.isInteger(searchInfo.totalhits)
    ? searchInfo.totalhits
    : null;
  const continuation = isRecord(payload.continue) && typeof payload.continue.gsroffset === "number"
    ? payload.continue.gsroffset
    : null;
  return { pages: payload.query.pages as WikiPage[], total, nextOffset: continuation };
}

const BOOK_CATEGORY = /(?:\bnovels?\b|\bnovellas?\b|\bbooks?\b|\bcollections?\b|\bantholog(?:y|ies)\b|\bplays?\b|\bdramas?\b|\bpoetry\b|\bpoems?\b|\bfiction\b|\btreatises?\b|\bmanuals?\b|\b(?:auto)?biograph(?:y|ies)\b|\bmemoirs?\b|\bdictionar(?:y|ies)\b|\bencyclop(?:a|æ)edias?\b|\bepics?\b|\breligious texts?\b)/iu;
const NON_BOOK_CATEGORY = /(?:disambiguation pages|versions pages|book reviews|films?\b|newspaper articles|magazine articles)/iu;

function hasBookLevelSignal(page: WikiPage) {
  if (page.title?.includes("/")) return false;
  if (page.pageprops && "disambiguation" in page.pageprops) return false;
  const categories = (page.categories ?? [])
    .map((category) => category.title?.replace(/^Category:/u, "").trim() ?? "")
    .filter(Boolean);
  if (categories.some((category) => NON_BOOK_CATEGORY.test(category))) return false;
  return categories.some((category) => BOOK_CATEGORY.test(category));
}

function bookForPage(page: WikiPage): NormalisedBook | undefined {
  if (!Number.isInteger(page.pageid) || page.ns !== 0 || typeof page.title !== "string" || !page.title.trim()) return undefined;
  if (typeof page.fullurl !== "string" || !page.fullurl.startsWith("https://en.wikisource.org/wiki/")) return undefined;
  if (!hasBookLevelSignal(page)) return undefined;

  const language = page.pagelanguage === "en" ? "English" : page.pagelanguage;
  const rights = {
    status: "source-policy-free" as const,
    jurisdiction: "Varies by work and reader location",
    note: "Wikisource hosts public-domain or freely licensed texts. Check the work's copyright tag because status can differ by country.",
    licenceUrl: "https://wikisource.org/wiki/Wikisource:Copyright_policy",
  };
  const offer = {
    source: "Wikisource" as const,
    access: "read" as const,
    label: "Read on Wikisource",
    url: page.fullurl,
    language,
    rights,
  };

  return {
    id: `wikisource-en-${page.pageid}`,
    title: page.title.trim(),
    authors: [],
    source: "Wikisource",
    access: "read",
    formats: [],
    detailsUrl: page.fullurl,
    language,
    clusterConfidence: "probable",
    why: ["Matched a book-level English Wikisource text with a direct free-to-read source page."],
    offers: [offer],
    sourceRecords: [{
      source: "Wikisource",
      recordId: `en:${page.pageid}`,
      detailsUrl: page.fullurl,
      language,
      offers: [offer],
    }],
  };
}

export const wikisourceAdapter: SourceAdapter = {
  source: "Wikisource",
  async search(input, fetchJson) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", searchExpression(input.query, input.by));
    url.searchParams.set("gsrnamespace", "0");
    url.searchParams.set("gsrlimit", String(PAGE_SIZE));
    url.searchParams.set("gsroffset", String(input.offset));
    url.searchParams.set("prop", "info|categories|pageprops");
    url.searchParams.set("inprop", "url");
    url.searchParams.set("clshow", "!hidden");
    url.searchParams.set("cllimit", "max");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("origin", "*");

    const payload = await fetchJson(url.toString(), USER_AGENT, 3_500);
    const result = normalisePages(payload);
    return {
      books: result.pages.flatMap((page) => {
        const book = bookForPage(page);
        return book ? [book] : [];
      }),
      total: result.total,
      hasMore: result.nextOffset !== null,
      advanceBy: result.nextOffset === null ? PAGE_SIZE : Math.max(1, result.nextOffset - input.offset),
    };
  },
};
