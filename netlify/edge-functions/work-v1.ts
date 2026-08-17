import { handleWorkRequest } from "../../app/api/v1/works/[workId]/route.ts";
import { dispatchPublicApiRequest } from "../../lib/public-api.ts";

export default function workV1(request: Request): Promise<Response> {
  const prefix = "/api/v1/works/";
  const pathname = new URL(request.url).pathname;
  const encodedId = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
  let workId = "";
  try {
    workId = decodeURIComponent(encodedId);
  } catch {
    // The route handler returns the canonical invalid-work response.
  }
  return dispatchPublicApiRequest(request, () => handleWorkRequest(request, workId));
}

export const config = { path: "/api/v1/works/*" };
