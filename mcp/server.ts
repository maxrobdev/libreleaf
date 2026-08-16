import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { GET as searchRoute } from "../app/api/search/route";

const MAX_TOOL_RESULTS = 20;
const DEFAULT_TOOL_RESULTS = 10;

const searchBySchema = z.enum(["q", "title", "author", "subject"]);
const rightsRegionSchema = z.enum(["GB", "US", "GLOBAL"]);
const accessSchema = z.enum(["download", "borrow", "preview", "read", "listen"]);

const formatSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});

const rightsSchema = z.object({
  status: z.enum(["source-assessed-public-domain", "open-licence", "source-policy-free"]),
  jurisdiction: z.string(),
  note: z.string(),
  licenceUrl: z.string().url().optional(),
  applicability: z.enum(["verified", "source-jurisdiction-only", "check-local"]).optional(),
});

const offerSchema = z.object({
  label: z.string(),
  url: z.string().url(),
  source: z.enum(["Project Gutenberg", "Open Library", "Wikisource", "DOAB"]),
  access: accessSchema,
  format: z.string().optional(),
  language: z.string().optional(),
  rights: rightsSchema.optional(),
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
  offers: z.array(offerSchema).optional(),
});

const sourceStatusSchema = z.object({
  gutenberg: z.enum(["ok", "unavailable", "timeout", "rate-limited", "exhausted"]),
  openLibrary: z.enum(["ok", "unavailable", "timeout", "rate-limited", "exhausted"]),
  wikisource: z.enum(["ok", "unavailable", "timeout", "rate-limited", "exhausted"]),
  doab: z.enum(["ok", "unavailable", "timeout", "rate-limited", "exhausted"]),
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
});

type SearchBy = z.infer<typeof searchBySchema>;
type SearchResult = z.infer<typeof searchResultSchema>;
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
    const isDoi = url.hostname === "doi.org";
    const allowed = kind === "download" ? isGutenberg || isDoab : isGutenberg || isOpenLibrary || isWikisource || isDoab || isDoi;
    return allowed ? url.toString() : undefined;
  } catch {
    return undefined;
  }
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
    offers: Array.isArray(value.offers)
      ? value.offers.slice(0, 8).flatMap((offer) => {
          if (!isRecord(offer) || typeof offer.label !== "string") return [];
          const access = accessSchema.safeParse(offer.access);
          const source = z.enum(["Project Gutenberg", "Open Library", "Wikisource", "DOAB"]).safeParse(offer.source);
          if (!access.success || !source.success) return [];
          const url = allowedSourceUrl(offer.url, access.data === "download" ? "download" : "catalogue");
          if (!url) return [];
          const rights = rightsSchema.safeParse(offer.rights);
          return [{
            label: offer.label,
            url,
            source: source.data,
            access: access.data,
            format: typeof offer.format === "string" ? offer.format : undefined,
            language: typeof offer.language === "string" ? offer.language : undefined,
            rights: rights.success ? rights.data : undefined,
          }];
        })
      : [],
  });

  return parsed.success ? parsed.data : undefined;
}

function interleaveSources(books: z.infer<typeof bookSchema>[]) {
  const combined = books.filter((book) => book.source.includes(" + "));
  const groups = ["Project Gutenberg", "Open Library", "Wikisource", "DOAB"]
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
    : { gutenberg: "unavailable" as const, openLibrary: "unavailable" as const, wikisource: "unavailable" as const, doab: "unavailable" as const };
  const contextParse = searchResultSchema.shape.rightsContext.safeParse(payload.rightsContext);
  const rankedBooks = interleaveSources(books);
  const result = {
    query: input.query,
    searchBy: input.searchBy,
    rightsContext: contextParse.success ? contextParse.data : { region: input.region ?? "GB", label: input.region === "US" ? "United States" : input.region === "GLOBAL" ? "Global / location not specified" : "United Kingdom", note: "Check local law and edition-specific terms." },
    returned: Math.min(input.limit, books.length),
    available: books.length,
    partial: [sources.gutenberg, sources.openLibrary, sources.wikisource, sources.doab]
      .some((status) => status !== "ok" && status !== "exhausted"),
    sources,
    books: rankedBooks.slice(0, input.limit),
  };

  return searchResultSchema.parse(result);
}

export function createLibreLeafMcpServer(dependencies: SearchDependencies = {}) {
  const server = new McpServer(
    { name: "libreleaf", version: "1.0.0" },
    {
      instructions:
        "Search lawful public-domain, library and open-access catalogues. Every route includes a source and access type. Rights context is source metadata, not legal advice; do not describe read, preview or borrow routes as downloads.",
    },
  );

  server.registerTool(
    "search_books",
    {
      title: "Search open books",
      description:
        "Search Project Gutenberg, Open Library, Wikisource and DOAB by keywords, title, author, or subject. Returns source-labelled download, borrow, preview and read routes with rights context.",
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

  return server;
}
