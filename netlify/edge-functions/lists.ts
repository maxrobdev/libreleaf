import { GET } from "../../app/api/lists/route.ts";
import { dispatchPublicApiRequest } from "../../lib/public-api.ts";

export default function lists(request: Request): Promise<Response> {
  return dispatchPublicApiRequest(request, () => GET());
}

export const config = {
  path: "/api/lists",
};
