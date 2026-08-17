import { briefEpubFilename, buildBriefEpub } from "../../../../lib/brief/epub.ts";
import { parseBriefSelection, BriefRequestError } from "../../../../lib/brief/request.ts";
import { aggregateBriefSelection, BriefSelectionError } from "../../../../lib/brief/service.ts";

export async function GET(request: Request) {
  try {
    const selection = parseBriefSelection(request);
    const payload = await aggregateBriefSelection(selection);
    if (!payload.items.length) {
      return Response.json(
        { error: "No current feed items are available for this edition." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    const epub = buildBriefEpub(payload);
    const body = epub.buffer.slice(epub.byteOffset, epub.byteOffset + epub.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${briefEpubFilename(payload)}"`,
        "Content-Length": String(epub.byteLength),
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
        "CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        "Netlify-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const requestError = error instanceof BriefRequestError || error instanceof BriefSelectionError;
    return Response.json(
      { error: requestError ? error.message : "The Briefleaf EPUB could not be created." },
      { status: requestError ? 400 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
