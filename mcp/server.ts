import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { GET as searchRoute } from "../app/api/search/route";
import {
  canonicalWorkUrl,
  decodeStableWorkId,
  MAX_WORK_ID_LENGTH,
  stableWorkId,
  WORK_ID_PREFIX,
  workIdentityMatches,
} from "../lib/work-identity.ts";

const MAX_TOOL_RESULTS = 20;
const DEFAULT_TOOL_RESULTS = 10;

const searchBySchema = z.enum(["q", "title", "author", "subject"]);
const rightsRegionSchema = z.enum(["GB", "US", "GLOBAL"]);
const accessSchema = z.enum(["download", "borrow", "preview", "read", "listen"]);
const catalogueSourceSchema = z.enum(["Project Gutenberg", "Open Library", "Wikisource", "DOAB", "Library of Congress"]);

const formatSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});

const rightsSchema = z.object({
  status: z.enum(["source-assessed-public-domain", "open-licence", "source-policy-free", "source-provided-access"]),
  jurisdiction: z.string(),
  note: z.string(),
  licenceUrl: z.string().url().optional(),
  applicability: z.enum(["verified", "source-jurisdiction-only", "check-local"]).optional(),
});

const offerSchema = z.object({
  label: z.string(),
  url: z.string().url(),
  source: catalogueSourceSchema,
  access: accessSchema,
  format: z.string().optional(),
  language: z.string().optional(),
  rights: rightsSchema.optional(),
});

const sourceRecordSchema = z.object({
  source: catalogueSourceSchema,
  recordId: z.string(),
  detailsUrl: z.string().url(),
  workKey: z.string().optional(),
  language: z.string().optional(),
  country: z.string().optional(),
  offers: z.array(offerSchema),
});

const rankingSchema = z.object({
  method: z.literal("rrf-v1"),
  score: z.number().nonnegative(),
  sourceRanks: z.array(z.object({ source: catalogueSourceSchema, rank: z.number().int().positive() })),
  reasons: z.array(z.string()),
});

const bookSchema = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  year: z.number().int().optional(),
  cover: z.string().url().optional(),
  source: z.string(),
  access: accessSchema,
  formats: z.array(formatSchema),
  detailsUrl: z.string().url(),
  language: z.string().optional(),
  country: z.string().optional(),
  workKey: z.string().optional(),
  clusterConfidence: z.enum(["exact", "probable"]).optional(),
  why: z.array(z.string()).optional(),
  offers: z.array(offerSchema).optional(),
  sourceRecords: z.array(sourceRecordSchema).optional(),
  canonicalId: z.string().optional(),
  canonicalUrl: z.string().url().optional(),
  ranking: rankingSchema.optional(),
});

const sourceStatusSchema = z.object({
  gutenberg: z.enum(["ok", "unavailable", "timeout", "rate-limited", "exhausted"]),
  openLibrary: z.enum(["ok", "unavailable", "timeout", "rate-limited", "exhausted"]),
  wikisource: z.enum(["ok", "unavailable", "timeout", "rate-limited", "exhausted"]),
  doab: z.enum(["ok", "unavailable", "timeout", "rate-limited", "exhausted"]),
  libraryOfCongress: z.enum(["ok", "unavailable", "timeout", "rate-limited", "exhausted"]),
});

const searchResultSchema = z.object({
  query: z.string(),
  searchBy: searchBySchema,
  rightsContext: z.object({ region: rightsRegionSchema, label: z.string(), note: z.string() }),
  returned: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  partial: z.boolean(),
  sources: sourceStatusSchema,
  books: z.array(bookSchema),
  ranking: z.object({
    method: z.literal("rrf-v1"),
    k: z.number().int().positive(),
    note: z.string(),
  }).optional(),
});

const resolveAccessResultSchema = z.object({
  query: z.object({ title: z.string(), author: z.string().optional() }),
  rightsContext: searchResultSchema.shape.rightsContext,
  canonicalMatch: bookSchema.nullable(),
  offers: z.array(offerSchema),
  ranking: z.object({
    quality: z.enum(["exact", "strong", "possible", "none"]),
    score: z.number().nonnegative(),
    candidatesConsidered: z.number().int().nonnegative(),
    explanation: z.array(z.string()),
  }),
  partial: z.boolean(),
  sources: sourceStatusSchema,
});

const compatibilitySearchItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
});

const compatibilitySearchResultSchema = z.object({
  results: z.array(compatibilitySearchItemSchema),
});

const compatibilityFetchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string().url(),
  metadata: z.object({
    authors: z.array(z.string()),
    year: z.number().int().optional(),
    sources: z.array(catalogueSourceSchema),
    accessTypes: z.array(accessSchema),
    routeCount: z.number().int().nonnegative(),
    rightsRegion: rightsRegionSchema,
    partial: z.boolean(),
    workKey: z.string().optional(),
  }),
});

type SearchBy = z.infer<typeof searchBySchema>;
type SearchResult = z.infer<typeof searchResultSchema>;
type ResolveAccessResult = z.infer<typeof resolveAccessResultSchema>;
type SearchRouteHandler = (request: Request) => Promise<Response>;

export type SearchDependencies = {
  searchHandler?: SearchRouteHandler;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function allowedSourceUrl(value: unknown, kind: "catalogue" | "download"): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    const isGutenberg = url.hostname === "gutenberg.org" || url.hostname.endsWith(".gutenberg.org");
    const isOpenLibrary = url.hostname === "openlibrary.org" || url.hostname.endsWith(".openlibrary.org");
    const isWikisource = url.hostname === "wikisource.org" || url.hostname.endsWith(".wikisource.org");
    const isDoab = url.hostname === "directory.doabooks.org";
    const isOapen = url.hostname === "oapen.org" || url.hostname.endsWith(".oapen.org");
    const isDoi = url.hostname === "doi.org";
    const isLibraryOfCongress = url.hostname === "loc.gov" || url.hostname.endsWith(".loc.gov");
    const allowed = kind === "download"
      ? isGutenberg || isDoab || isOapen || isLibraryOfCongress
      : isGutenberg || isOpenLibrary || isWikisource || isDoab || isOapen || isDoi || isLibraryOfCongress;
    return allowed ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function publicOffer(value: unknown): z.infer<typeof offerSchema> | undefined {
  if (!isRecord(value) || typeof value.label !== "string") return undefined;
  const access = accessSchema.safeParse(value.access);
  const source = catalogueSourceSchema.safeParse(value.source);
  if (!access.success || !source.success) return undefined;
  const url = allowedSourceUrl(value.url, access.data === "download" ? "download" : "catalogue");
  if (!url) return undefined;
  const rights = rightsSchema.safeParse(value.rights);
  return {
    label: value.label,
    url,
    source: source.data,
    access: access.data,
    format: typeof value.format === "string" ? value.format : undefined,
    language: typeof value.language === "string" ? value.language : undefined,
    rights: rights.success ? rights.data : undefined,
  };
}

function publicBook(value: unknown): z.infer<typeof bookSchema> | undefined {
  if (!isRecord(value)) return undefined;

  const detailsUrl = allowedSourceUrl(value.detailsUrl, "catalogue");
  if (!detailsUrl) return undefined;
  const formats = Array.isArray(value.formats)
    ? value.formats.slice(0, 5).flatMap((format) => {
        if (!isRecord(format) || typeof format.label !== "string") return [];
        const url = allowedSourceUrl(format.url, "download");
        return url ? [{ label: format.label, url }] : [];
      })
    : [];

  const parsed = bookSchema.safeParse({
    id: value.id,
    title: value.title,
    authors: Array.isArray(value.authors) ? value.authors.slice(0, 5) : [],
    year: value.year,
    cover: allowedSourceUrl(value.cover, "catalogue"),
    source: value.source,
    access: value.access,
    formats,
    detailsUrl,
    language: value.language,
    country: value.country,
    workKey: value.workKey,
    clusterConfidence: value.clusterConfidence,
    why: Array.isArray(value.why) ? value.why.filter((reason): reason is string => typeof reason === "string").slice(0, 12) : undefined,
    offers: Array.isArray(value.offers)
      ? value.offers.flatMap((offer) => {
          const parsedOffer = publicOffer(offer);
          return parsedOffer ? [parsedOffer] : [];
        })
      : [],
    sourceRecords: Array.isArray(value.sourceRecords)
      ? value.sourceRecords.flatMap((record) => {
          if (!isRecord(record)) return [];
          const source = catalogueSourceSchema.safeParse(record.source);
          const detailsUrl = allowedSourceUrl(record.detailsUrl, "catalogue");
          if (!source.success || !detailsUrl || typeof record.recordId !== "string") return [];
          return [{
            source: source.data,
            recordId: record.recordId,
            detailsUrl,
            workKey: typeof record.workKey === "string" ? record.workKey : undefined,
            language: typeof record.language === "string" ? record.language : undefined,
            country: typeof record.country === "string" ? record.country : undefined,
            offers: Array.isArray(record.offers) ? record.offers.flatMap((offer) => {
              const parsedOffer = publicOffer(offer);
              return parsedOffer ? [parsedOffer] : [];
            }) : [],
          }];
        })
      : [],
    ranking: rankingSchema.safeParse(value.ranking).success ? rankingSchema.parse(value.ranking) : undefined,
  });

  if (!parsed.success) return undefined;
  const canonicalId = stableWorkId(parsed.data);
  return { ...parsed.data, canonicalId, canonicalUrl: canonicalWorkUrl(parsed.data, canonicalId) };
}

function interleaveSources(books: z.infer<typeof bookSchema>[]) {
  const combined = books.filter((book) => book.source.includes(" + "));
  const groups = catalogueSourceSchema.options
    .map((source) => books.filter((book) => book.source === source));
  const interleaved: z.infer<typeof bookSchema>[] = [];

  for (let index = 0; index < Math.max(0, ...groups.map((group) => group.length)); index += 1) {
    for (const group of groups) if (group[index]) interleaved.push(group[index]);
  }

  return [...combined, ...interleaved];
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && typeof payload.error === "string") return payload.error;
  } catch {
    // The route may return an empty or non-JSON upstream error.
  }
  return "The public book catalogues are temporarily unavailable.";
}

export async function searchBooks(
  input: { query: string; searchBy: SearchBy; limit: number; region?: z.infer<typeof rightsRegionSchema> },
  dependencies: SearchDependencies = {},
): Promise<SearchResult> {
  const url = new URL("https://libreleaf.local/api/search");
  url.searchParams.set("q", input.query);
  url.searchParams.set("by", input.searchBy);
  url.searchParams.set("region", input.region ?? "GB");

  const response = await (dependencies.searchHandler ?? searchRoute)(new Request(url));
  if (!response.ok) throw new Error(await errorMessage(response));

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.books)) {
    throw new Error("The catalogue returned an invalid response.");
  }

  const books = payload.books.flatMap((book) => {
    const result = publicBook(book);
    return result ? [result] : [];
  });

  const sourceParse = sourceStatusSchema.safeParse(payload.sources);
  const sources = sourceParse.success
    ? sourceParse.data
    : { gutenberg: "unavailable" as const, openLibrary: "unavailable" as const, wikisource: "unavailable" as const, doab: "unavailable" as const, libraryOfCongress: "unavailable" as const };
  const contextParse = searchResultSchema.shape.rightsContext.safeParse(payload.rightsContext);
  const rankedBooks = books.some((book) => book.ranking)
    ? [...books].sort((left, right) => (right.ranking?.score ?? 0) - (left.ranking?.score ?? 0))
    : interleaveSources(books);
  const rankingParse = searchResultSchema.shape.ranking.safeParse(payload.ranking);
  const result = {
    query: input.query,
    searchBy: input.searchBy,
    rightsContext: contextParse.success ? contextParse.data : { region: input.region ?? "GB", label: input.region === "US" ? "United States" : input.region === "GLOBAL" ? "Global / location not specified" : "United Kingdom", note: "Check local law and edition-specific terms." },
    returned: Math.min(input.limit, books.length),
    available: books.length,
    partial: [sources.gutenberg, sources.openLibrary, sources.wikisource, sources.doab, sources.libraryOfCongress]
      .some((status) => status !== "ok" && status !== "exhausted"),
    sources,
    books: rankedBooks.slice(0, input.limit),
    ranking: rankingParse.success ? rankingParse.data : undefined,
  };

  return searchResultSchema.parse(result);
}

function normaliseMatchText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function normaliseMatchAuthor(value: string) {
  return normaliseMatchText(value).split(" ").filter(Boolean).sort().join(" ");
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

function rankBook(book: z.infer<typeof bookSchema>, title: string, author?: string) {
  const wantedTitle = normaliseMatchText(title);
  const candidateTitle = normaliseMatchText(book.title);
  const explanation: string[] = [];
  let score = 0;

  if (candidateTitle === wantedTitle) {
    score += 100;
    explanation.push("Exact normalized title match.");
  } else if (candidateTitle.includes(wantedTitle) || wantedTitle.includes(candidateTitle)) {
    score += 75;
    explanation.push("Strong partial title match.");
  } else {
    const similarity = tokenSimilarity(wantedTitle, candidateTitle);
    score += Math.round(similarity * 60);
    explanation.push(`Title token overlap: ${Math.round(similarity * 100)}%.`);
  }

  if (author) {
    const wantedAuthor = normaliseMatchAuthor(author);
    const candidateAuthors = book.authors.map(normaliseMatchAuthor);
    if (candidateAuthors.some((candidate) => candidate === wantedAuthor)) {
      score += 40;
      explanation.push("Exact normalized author match.");
    } else if (candidateAuthors.some((candidate) => candidate.includes(wantedAuthor) || wantedAuthor.includes(candidate))) {
      score += 30;
      explanation.push("Strong partial author match.");
    } else {
      const similarity = Math.max(0, ...candidateAuthors.map((candidate) => tokenSimilarity(wantedAuthor, candidate)));
      score += Math.round(similarity * 25);
      explanation.push(`Best author token overlap: ${Math.round(similarity * 100)}%.`);
    }
  }

  const independentSources = new Set((book.offers ?? []).map((offer) => offer.source)).size;
  const routeCount = book.offers?.length ?? 0;
  score += Math.min(independentSources, 4) * 2 + Math.min(routeCount, 5);
  explanation.push(`${routeCount} validated access route${routeCount === 1 ? "" : "s"} across ${independentSources} source${independentSources === 1 ? "" : "s"}.`);

  return { book, score, explanation };
}

function uniqueOffers(offers: z.infer<typeof offerSchema>[]) {
  return offers.filter((offer, index, all) => all.findIndex((item) => item.source === offer.source && item.access === offer.access && item.url === offer.url) === index);
}

export async function resolveAccess(
  input: { title: string; author?: string; region: z.infer<typeof rightsRegionSchema> },
  dependencies: SearchDependencies = {},
): Promise<ResolveAccessResult> {
  const search = await searchBooks(
    { query: input.title, searchBy: "title", limit: MAX_TOOL_RESULTS, region: input.region },
    dependencies,
  );
  const ranked = search.books
    .map((book) => rankBook(book, input.title, input.author))
    .sort((left, right) => right.score - left.score || right.book.offers!.length - left.book.offers!.length || left.book.title.localeCompare(right.book.title));
  const best = ranked[0];
  const match = best?.book ?? null;
  const quality = !best ? "none" : best.score >= (input.author ? 140 : 100) ? "exact" : best.score >= 75 ? "strong" : "possible";
  const explanation = best
    ? [...best.explanation, "Ranking prioritizes title, then the optional author; ties prefer more independently sourced access routes."]
    : ["No validated catalogue match was returned."];

  return resolveAccessResultSchema.parse({
    query: { title: input.title, author: input.author },
    rightsContext: search.rightsContext,
    canonicalMatch: match,
    offers: match ? uniqueOffers(match.offers ?? []) : [],
    ranking: {
      quality,
      score: best?.score ?? 0,
      candidatesConsidered: search.books.length,
      explanation,
    },
    partial: search.partial,
    sources: search.sources,
  });
}

export async function compatibilitySearch(
  query: string,
  dependencies: SearchDependencies = {},
) {
  const search = await searchBooks(
    { query, searchBy: "q", limit: DEFAULT_TOOL_RESULTS, region: "GB" },
    dependencies,
  );
  const seen = new Set<string>();
  const results = search.books.flatMap((book) => {
    const id = stableWorkId(book);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, title: book.title, url: canonicalWorkUrl(book, id) }];
  });
  return compatibilitySearchResultSchema.parse({ results });
}

function fetchedWorkText(
  book: z.infer<typeof bookSchema>,
  search: SearchResult,
) {
  const author = book.authors.length ? book.authors.join(", ") : "Author not supplied by the catalogues";
  const publication = book.year ? `First publication year: ${book.year}.` : "Publication year not supplied.";
  const routes = uniqueOffers(book.offers ?? []).map((offer) => {
    const rights = offer.rights
      ? ` Rights: ${offer.rights.note}${offer.rights.applicability ? ` Applicability: ${offer.rights.applicability}.` : ""}`
      : " Rights were not assessed by LibreLeaf; check the source and local law.";
    return `- ${offer.label} — ${offer.source} (${offer.access}): ${offer.url}.${rights}`;
  });
  const reasons = book.why?.length ? `Resolver notes: ${book.why.join(" ")}` : "";
  return [
    `Work: ${book.title}.`,
    `Author: ${author}.`,
    publication,
    `LibreLeaf found ${routes.length} validated access route${routes.length === 1 ? "" : "s"}.`,
    routes.length ? `Access routes:\n${routes.join("\n")}` : "No validated access route was returned.",
    `Rights context: ${search.rightsContext.label}. ${search.rightsContext.note}`,
    reasons,
    search.partial ? "One or more catalogues were temporarily unavailable, so this record may be incomplete." : "All queried catalogues responded or were exhausted.",
  ].filter(Boolean).join("\n\n");
}

export async function compatibilityFetch(
  id: string,
  dependencies: SearchDependencies = {},
) {
  const identity = decodeStableWorkId(id);
  const search = await searchBooks(
    { query: identity.t, searchBy: "title", limit: MAX_TOOL_RESULTS, region: "GB" },
    dependencies,
  );
  const book = search.books.find((candidate) => workIdentityMatches(candidate, identity));
  if (!book) throw new Error("This LibreLeaf work could not be refreshed from the public catalogues.");

  const sources = [...new Set((book.sourceRecords ?? []).map((record) => record.source))];
  const offers = uniqueOffers(book.offers ?? []);
  const accessTypes = [...new Set(offers.map((offer) => offer.access))];
  return compatibilityFetchResultSchema.parse({
    id,
    title: book.title,
    text: fetchedWorkText(book, search),
    url: canonicalWorkUrl(book, id),
    metadata: {
      authors: book.authors,
      year: book.year,
      sources,
      accessTypes,
      routeCount: offers.length,
      rightsRegion: search.rightsContext.region,
      partial: search.partial,
      workKey: book.workKey,
    },
  });
}

export function createLibreLeafMcpServer(dependencies: SearchDependencies = {}) {
  const server = new McpServer(
    { name: "libreleaf", version: "1.0.0" },
    {
      instructions:
        "Use search then fetch for ChatGPT research and citations; use search_books for structured catalogue exploration and resolve_access for one canonical work. Search lawful public-domain, library and open-access catalogues. Every route includes a source and access type. Rights context is source metadata, not legal advice; do not describe read, preview or borrow routes as downloads.",
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search LibreLeaf works",
      description:
        "Search LibreLeaf's public book catalogues for citation-ready work records. Use fetch with a returned ID to retrieve the complete resolver record and access routes.",
      inputSchema: {
        query: z.string().trim().min(1).max(120).describe("Book title, author, subject, or keywords."),
      },
      outputSchema: compatibilitySearchResultSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ query }) => {
      try {
        const result = await compatibilitySearch(query, dependencies);
        return {
          structuredContent: result,
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "LibreLeaf search could not be completed.";
        return { isError: true, content: [{ type: "text" as const, text: message }] };
      }
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch a LibreLeaf work",
      description:
        "Fetch one citation-ready LibreLeaf resolver record by the stable ID returned from search, including provenance, rights context, and validated access routes.",
      inputSchema: {
        id: z.string().min(WORK_ID_PREFIX.length + 4).max(MAX_WORK_ID_LENGTH).describe("Stable LibreLeaf work ID returned by search."),
      },
      outputSchema: compatibilityFetchResultSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ id }) => {
      try {
        const result = await compatibilityFetch(id, dependencies);
        return {
          structuredContent: result,
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "The LibreLeaf work could not be fetched.";
        return { isError: true, content: [{ type: "text" as const, text: message }] };
      }
    },
  );

  server.registerTool(
    "search_books",
    {
      title: "Search open books",
      description:
        "Search Project Gutenberg, Open Library, Wikisource, DOAB and the Library of Congress by keywords, title, author, or subject. Returns source-labelled download, borrow, preview and read routes with rights context.",
      inputSchema: {
        query: z.string().trim().min(1).max(120).describe("Book title, author, subject, or keywords."),
        search_by: searchBySchema
          .default("q")
          .describe("Use q for a broad keyword search, or target title, author, or subject."),
        limit: z.number()
          .int()
          .min(1)
          .max(MAX_TOOL_RESULTS)
          .default(DEFAULT_TOOL_RESULTS)
          .describe("Maximum number of records to return, from 1 to 20."),
        region: rightsRegionSchema.default("GB").describe("Rights context: GB, US, or GLOBAL when location is unknown."),
      },
      outputSchema: searchResultSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ query, search_by: searchBy, limit, region }) => {
      try {
        const result = await searchBooks(
          { query, searchBy, limit, region },
          dependencies,
        );

        const accessSummary = result.books.reduce(
          (counts, book) => ({ ...counts, [book.access]: counts[book.access] + 1 }),
          { download: 0, borrow: 0, preview: 0, read: 0, listen: 0 },
        );
        const unavailableSourceCount = Object.values(result.sources)
          .filter((status) => status !== "ok" && status !== "exhausted").length;
        const partialNote = unavailableSourceCount === 1
          ? " One catalogue was temporarily unavailable."
          : unavailableSourceCount > 1
            ? ` ${unavailableSourceCount} catalogues were temporarily unavailable.`
            : "";

        return {
          structuredContent: result,
          content: [{
            type: "text" as const,
            text:
              `Found ${result.returned} books (${accessSummary.download} downloadable, ` +
              `${accessSummary.borrow} borrowable, ${accessSummary.read} readable online, ${accessSummary.preview} preview-only).` +
              partialNote,
          }],
        };
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "The book search could not be completed.";
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.registerTool(
    "resolve_access",
    {
      title: "Resolve book access",
      description:
        "Resolve a title to one canonical best match and return every validated, source-labelled access route. Optional author disambiguates works; region controls rights context without making a legal determination.",
      inputSchema: {
        title: z.string().trim().min(1).max(120).describe("Book title to resolve."),
        author: z.string().trim().min(1).max(120).optional().describe("Optional author for disambiguation."),
        region: rightsRegionSchema.default("GB").describe("Rights context: GB, US, or GLOBAL when location is unknown."),
      },
      outputSchema: resolveAccessResultSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ title, author, region }) => {
      try {
        const result = await resolveAccess({ title, author, region }, dependencies);
        const summary = result.canonicalMatch
          ? `Resolved “${title}” to “${result.canonicalMatch.title}” (${result.ranking.quality}; ${result.offers.length} validated access route${result.offers.length === 1 ? "" : "s"}).`
          : `No validated catalogue match was found for “${title}”.`;
        return {
          structuredContent: result,
          content: [{ type: "text" as const, text: summary }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Book access could not be resolved.";
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  return server;
}
