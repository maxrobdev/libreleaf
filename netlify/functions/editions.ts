import { GET } from "../../app/api/editions/route";
import { dispatchPublicApiRequest } from "../../lib/public-api";

export default async function editions(request: Request): Promise<Response> {
  return dispatchPublicApiRequest(request, () => GET(request));
}
