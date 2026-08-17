import { GET } from "../../app/api/brief/route.ts";

export default function brief(request: Request): Promise<Response> {
  return GET(request);
}

export const config = {
  path: "/api/brief",
  cache: "manual" as const,
};
