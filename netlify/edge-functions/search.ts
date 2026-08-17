import { GET } from "../../app/api/search/route.ts";
import { dispatchPublicApiRequest } from "../../lib/public-api.ts";

export default function search(request: Request): Promise<Response> {
  return dispatchPublicApiRequest(request, () => GET(request));
}

export const config = {
  path: "/api/search",
};
