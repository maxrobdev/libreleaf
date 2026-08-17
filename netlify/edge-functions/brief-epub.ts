import { GET } from "../../app/api/brief/epub/route.ts";

export default function briefEpub(request: Request): Promise<Response> {
  return GET(request);
}

export const config = {
  path: "/api/brief/epub",
  cache: "manual" as const,
};
