import { GET } from "../../app/api/search/route.ts";

export default function search(request: Request): Promise<Response> {
  return GET(request);
}

export const config = {
  path: "/api/search",
};
