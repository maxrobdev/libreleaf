import { GET } from "../../app/api/search/route";

export default async function search(request: Request): Promise<Response> {
  return GET(request);
}
