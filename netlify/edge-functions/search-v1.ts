import { GET } from "../../app/api/v1/search/route.ts";
import { dispatchPublicApiRequest } from "../../lib/public-api.ts";

export default function searchV1(request: Request): Promise<Response> {
  return dispatchPublicApiRequest(request, () => GET(request));
}

export const config = { path: "/api/v1/search" };
