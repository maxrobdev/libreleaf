import { parseBriefSelection, BriefRequestError } from "../../../lib/brief/request.ts";
import { aggregateBriefSelection, BriefSelectionError } from "../../../lib/brief/service.ts";

const successHeaders = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
  "CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
  "Netlify-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};

export async function GET(request: Request) {
  try {
    const selection = parseBriefSelection(request);
    const payload = await aggregateBriefSelection(selection);
    if (!payload.items.length && payload.sources.every((source) => source.state === "unavailable")) {
      return Response.json(
        { ...payload, error: "No reviewed feeds responded. Source status is included below." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(payload, { headers: successHeaders });
  } catch (error) {
    const requestError = error instanceof BriefRequestError || error instanceof BriefSelectionError;
    return Response.json(
      { error: requestError ? error.message : "Briefleaf feeds are temporarily unavailable." },
      { status: requestError ? 400 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
