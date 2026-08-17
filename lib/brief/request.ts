import {
  BRIEF_COUNTRIES,
  BRIEF_FEEDS,
  BRIEF_MAX_SELECTED_FEEDS,
  BRIEF_TOPICS,
  type BriefCountry,
  type BriefTopic,
} from "./registry.ts";

export class BriefRequestError extends Error {}

export type BriefRequestSelection = {
  country: BriefCountry;
  topic: BriefTopic;
  feedIds?: string[];
};

export function parseBriefSelection(request: Request): BriefRequestSelection {
  const params = new URL(request.url).searchParams;
  const allowedParameters = new Set(["country", "topic", "feed"]);
  for (const key of params.keys()) {
    if (!allowedParameters.has(key)) throw new BriefRequestError("Invalid Briefleaf parameter.");
  }
  if (params.getAll("country").length > 1 || params.getAll("topic").length > 1) {
    throw new BriefRequestError("Provide one country and topic.");
  }
  const rawCountry = params.get("country") ?? "GB";
  const rawTopic = params.get("topic") ?? "top";
  if (!BRIEF_COUNTRIES.some((country) => country === rawCountry)) throw new BriefRequestError("Invalid country.");
  if (!BRIEF_TOPICS.some((topic) => topic === rawTopic)) throw new BriefRequestError("Invalid topic.");
  const requestedFeeds = params.getAll("feed");
  if (requestedFeeds.length > BRIEF_MAX_SELECTED_FEEDS) {
    throw new BriefRequestError(`Select no more than ${BRIEF_MAX_SELECTED_FEEDS} feeds.`);
  }
  const feedIds = [...new Set(requestedFeeds)];
  if (requestedFeeds.length && !feedIds.length) throw new BriefRequestError("Select at least one feed.");
  const reviewedIds = new Set(BRIEF_FEEDS.map((feed) => feed.id));
  if (feedIds.some((feedId) => !reviewedIds.has(feedId))) {
    throw new BriefRequestError("Invalid reviewed feed selection.");
  }
  return {
    country: rawCountry as BriefCountry,
    topic: rawTopic as BriefTopic,
    feedIds: requestedFeeds.length ? feedIds : undefined,
  };
}
