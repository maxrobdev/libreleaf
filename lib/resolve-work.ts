import type { NormalisedBook, RightsRegion } from "./sources/types.ts";
import { decodeStableWorkId, workIdentityMatches } from "./work-identity.ts";

export const MAX_WORK_RESOLUTION_PAGES = 3;

export type ResolverSourceStatus = "ok" | "stale" | "deferred" | "unavailable" | "timeout" | "rate-limited" | "exhausted";

export type ResolverSources = {
  gutenberg: ResolverSourceStatus;
  openLibrary: ResolverSourceStatus;
  wikisource: ResolverSourceStatus;
  doab: ResolverSourceStatus;
  libraryOfCongress: ResolverSourceStatus;
  librivox: ResolverSourceStatus;
};

export type ResolverRightsContext = {
  region: RightsRegion;
  label: string;
  note: string;
};

export type WorkResolution = {
  work: NormalisedBook | null;
  rightsContext: ResolverRightsContext;
  partial: boolean;
  sources: ResolverSources;
  pagesSearched: number;
  exhausted: boolean;
};

export type SearchRouteHandler = (request: Request) => Promise<Response>;

export class WorkResolutionError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sourceStatus(value: unknown): value is ResolverSourceStatus {
  return value === "ok" || value === "stale" || value === "deferred" || value === "unavailable" || value === "timeout" || value === "rate-limited" || value === "exhausted";
}

function parseSources(value: unknown): ResolverSources | null {
  if (!isRecord(value)) return null;
  if (
    !sourceStatus(value.gutenberg)
    || !sourceStatus(value.openLibrary)
    || !sourceStatus(value.wikisource)
    || !sourceStatus(value.doab)
    || !sourceStatus(value.libraryOfCongress)
    || !sourceStatus(value.librivox)
  ) return null;
  return {
    gutenberg: value.gutenberg,
    openLibrary: value.openLibrary,
    wikisource: value.wikisource,
    doab: value.doab,
    libraryOfCongress: value.libraryOfCongress,
    librivox: value.librivox,
  };
}

function parseRightsContext(value: unknown, region: RightsRegion): ResolverRightsContext {
  if (
    isRecord(value)
    && (value.region === "GB" || value.region === "US" || value.region === "GLOBAL")
    && typeof value.label === "string"
    && typeof value.note === "string"
  ) return { region: value.region, label: value.label, note: value.note };
  return {
    region,
    label: region === "US" ? "United States" : region === "GLOBAL" ? "Global / location not specified" : "United Kingdom",
    note: "Source and licence context only; check local law and edition-specific terms.",
  };
}

async function responseError(response: Response) {
  try {
    const value: unknown = await response.json();
    if (isRecord(value) && typeof value.error === "string") return value.error;
  } catch {
    // Preserve a bounded public error when an upstream handler returns invalid JSON.
  }
  return "The resolver request could not be completed.";
}

export async function resolveWorkById(
  id: string,
  region: RightsRegion,
  searchHandler: SearchRouteHandler,
): Promise<WorkResolution> {
  let identity;
  try {
    identity = decodeStableWorkId(id);
  } catch {
    throw new WorkResolutionError(400, "invalid_work_id", "Use a canonical LibreLeaf work ID beginning llw1.");
  }

  let cursor: string | null = null;
  let pagesSearched = 0;
  let partial = false;
  let sources: ResolverSources = {
    gutenberg: "unavailable",
    openLibrary: "unavailable",
    wikisource: "unavailable",
    doab: "unavailable",
    libraryOfCongress: "unavailable",
    librivox: "unavailable",
  };
  let rightsContext = parseRightsContext(null, region);

  while (pagesSearched < MAX_WORK_RESOLUTION_PAGES) {
    const url = new URL("https://libreleaf.local/api/v1/search");
    url.searchParams.set("q", identity.t);
    url.searchParams.set("by", "title");
    url.searchParams.set("region", region);
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await searchHandler(new Request(url));
    if (!response.ok) {
      throw new WorkResolutionError(
        response.status >= 400 && response.status <= 599 ? response.status : 502,
        "resolver_unavailable",
        await responseError(response),
      );
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.books)) {
      throw new WorkResolutionError(502, "invalid_resolver_response", "The resolver returned an unexpected response.");
    }
    pagesSearched += 1;
    partial = partial || payload.partial === true;
    sources = parseSources(payload.sources) ?? sources;
    rightsContext = parseRightsContext(payload.rightsContext, region);

    const work = payload.books.find((candidate): candidate is NormalisedBook => {
      if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.title !== "string" || !Array.isArray(candidate.authors)) return false;
      return workIdentityMatches(candidate as unknown as NormalisedBook, identity);
    });
    if (work) return { work, rightsContext, partial, sources, pagesSearched, exhausted: payload.nextCursor === null };

    if (payload.nextCursor === null) return { work: null, rightsContext, partial, sources, pagesSearched, exhausted: true };
    if (typeof payload.nextCursor !== "string" || !payload.nextCursor || payload.nextCursor.length > 384) {
      throw new WorkResolutionError(502, "invalid_resolver_cursor", "The resolver returned an invalid cursor.");
    }
    cursor = payload.nextCursor;
  }

  return { work: null, rightsContext, partial, sources, pagesSearched, exhausted: false };
}
