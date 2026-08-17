import { GET } from "../../app/api/search/route";
import { dispatchPublicApiRequest } from "../../lib/public-api";

export default async function search(request: Request): Promise<Response> {
  return dispatchPublicApiRequest(request, () => GET(request));
}
