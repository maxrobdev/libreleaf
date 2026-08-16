import { GET } from "../../app/api/lists/route";

export default async function lists(): Promise<Response> {
  return GET();
}

export const config = { path: "/api/lists" };
