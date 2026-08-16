import { GET } from "../../app/api/editions/route.ts";

export default function editions(request: Request): Promise<Response> {
  return GET(request);
}

export const config = {
  path: "/api/editions",
};
