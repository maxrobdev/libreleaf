import { GET } from "../../app/api/lists/route";
import { dispatchPublicApiRequest } from "../../lib/public-api";

export default async function lists(request: Request): Promise<Response> {
  return dispatchPublicApiRequest(request, () => GET());
}

export const config = { path: "/api/lists" };
