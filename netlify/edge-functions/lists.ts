import { GET } from "../../app/api/lists/route.ts";

export default function lists(): Promise<Response> {
  return GET();
}

export const config = {
  path: "/api/lists",
};
