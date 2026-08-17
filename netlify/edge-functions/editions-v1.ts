import { GET } from "../../app/api/v1/editions/route.ts";
import { dispatchPublicApiRequest } from "../../lib/public-api.ts";

export default function editionsV1(request: Request): Promise<Response> {
  return dispatchPublicApiRequest(request, () => GET(request));
}

export const config = { path: "/api/v1/editions" };
