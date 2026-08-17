import { handleWorkRequest } from "../../app/api/v1/works/[workId]/route";
import { dispatchPublicApiRequest } from "../../lib/public-api";

export default function work(request: Request): Promise<Response> {
  const workId = new URL(request.url).searchParams.get("workId") ?? "";
  return dispatchPublicApiRequest(request, () => handleWorkRequest(request, workId));
}
