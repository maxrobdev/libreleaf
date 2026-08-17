import { GET } from "../../app/api/editions/route.ts";
import { dispatchPublicApiRequest } from "../../lib/public-api.ts";

export default function editions(request: Request): Promise<Response> {
  return dispatchPublicApiRequest(request, () => GET(request));
}

export const config = {
  path: "/api/editions",
};
