import { GET as searchRoute } from "../../../search/route.ts";
import { publicApiMethodNotAllowed, publicApiOptions, withPublicApiHeaders } from "../../../../../lib/public-api.ts";
import { resolveWorkById, WorkResolutionError } from "../../../../../lib/resolve-work.ts";
import type { RightsRegion } from "../../../../../lib/sources/types.ts";

const successHeaders = {
  "Cache-Control": "public, max-age=60, s-maxage=900, stale-while-revalidate=86400",
  "CDN-Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=1800, stale-while-revalidate=86400",
};

const partialHeaders = {
  "Cache-Control": "public, max-age=15, s-maxage=60, stale-while-revalidate=120",
  "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
  "Netlify-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

function parseRegion(value: string | null): RightsRegion {
  if (value === null || value === "" || value === "GB") return "GB";
  if (value === "US" || value === "GLOBAL") return value;
  throw new WorkResolutionError(400, "invalid_rights_region", "Use GB, US or GLOBAL for region.");
}

export async function handleWorkRequest(request: Request, workId: string) {
  try {
    const params = new URL(request.url).searchParams;
    const regions = params.getAll("region");
    if (regions.length > 1) throw new WorkResolutionError(400, "invalid_rights_region", "Provide one region value.");
    const region = parseRegion(regions[0] ?? null);
    const resolution = await resolveWorkById(workId, region, searchRoute);
    if (!resolution.work) {
      return withPublicApiHeaders(Response.json({
        error: "work_not_found",
        message: resolution.exhausted
          ? "This LibreLeaf work is not present in the current catalogue results."
          : "This LibreLeaf work was not found within the three-page refresh limit.",
        canonicalId: workId,
        resolution: { pagesSearched: resolution.pagesSearched, exhausted: resolution.exhausted },
        partial: resolution.partial,
        sources: resolution.sources,
      }, { status: 404, headers: { "Cache-Control": "public, max-age=0, s-maxage=30" } }));
    }

    return withPublicApiHeaders(Response.json({
      canonicalId: resolution.work.canonicalId ?? workId,
      canonicalUrl: resolution.work.canonicalUrl,
      work: resolution.work,
      rightsContext: resolution.rightsContext,
      partial: resolution.partial,
      sources: resolution.sources,
      resolution: { pagesSearched: resolution.pagesSearched, exhausted: resolution.exhausted },
    }, { headers: resolution.partial ? partialHeaders : successHeaders }));
  } catch (error) {
    const known = error instanceof WorkResolutionError;
    return withPublicApiHeaders(Response.json({
      error: known ? error.code : "work_resolution_failed",
      message: known ? error.message : "The work could not be resolved.",
    }, { status: known ? error.status : 500, headers: { "Cache-Control": "no-store" } }));
  }
}

type RouteContext = { params: Promise<{ workId: string }> | { workId: string } };

export async function GET(request: Request, context: RouteContext) {
  const params = await context.params;
  return handleWorkRequest(request, params.workId);
}

export const OPTIONS = publicApiOptions;
export const HEAD = publicApiMethodNotAllowed;
export const POST = publicApiMethodNotAllowed;
export const PUT = publicApiMethodNotAllowed;
export const PATCH = publicApiMethodNotAllowed;
export const DELETE = publicApiMethodNotAllowed;
