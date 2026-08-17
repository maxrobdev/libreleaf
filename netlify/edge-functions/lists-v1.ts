import { GET } from "../../app/api/v1/lists/route.ts";
import { dispatchPublicApiRequest } from "../../lib/public-api.ts";

export default function listsV1(request: Request): Promise<Response> {
  return dispatchPublicApiRequest(request, () => GET());
}

export const config = { path: "/api/v1/lists" };
