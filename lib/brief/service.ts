import {
  BRIEF_COUNTRY_LABELS,
  BRIEF_FEEDS,
  BRIEF_MAX_SELECTED_FEEDS,
  BRIEF_TOPIC_LABELS,
  feedsFor,
  type BriefCountry,
  type BriefFeed,
  type BriefTopic,
} from "./registry.ts";

export const BRIEF_LIMITS = {
  feedsPerRequest: 4,
  feedBytes: 256 * 1024,
  feedItems: 30,
  resultItems: 24,
  contentCharacters: 12_000,
  summaryCharacters: 480,
  summaryWords: 80,
  titleCharacters: 180,
  requestTimeoutMs: 2_500,
  freshSeconds: 5 * 60,
  staleSeconds: 60 * 60,
} as const;

export type BriefItem = {
  id: string;
  title: string;
  summary?: string;
  content?: string;
  publishedAt?: string;
  url: string;
  source: {
    id: string;
    name: string;
    homepage: string;
  };
};

export type BriefSource = {
  id: string;
  name: string;
  homepage: string;
  termsUrl: string;
  state: "live" | "cached" | "stale" | "unavailable";
  fetchedAt?: string;
  itemCount: number;
  error?: string;
};

export type BriefPayload = {
  country: BriefCountry;
  countryLabel: string;
  topic: BriefTopic;
  topicLabel: string;
  editionTitle: string;
  editionSlug: string;
  feedIds: string[];
  selectionMode: "preset" | "feeds";
  generatedAt: string;
  partial: boolean;
  personalUseOnly: true;
  items: BriefItem[];
  sources: BriefSource[];
  limits: {
    maxItems: number;
    maxSummaryCharacters: number;
    maxContentCharacters: number;
  };
};

type CachedFeed = {
  fetchedAt: string;
  freshUntil: number;
  staleUntil: number;
  items: BriefItem[];
};

export type BriefDependencies = {
  registry?: readonly BriefFeed[];
  fetchFeed?: (feed: BriefFeed) => Promise<string>;
  now?: () => Date;
};

const cache = new Map<string, CachedFeed>();
const APP_USER_AGENT = "LibreLeaf/0.1 (+https://github.com/maxrobdev/libreleaf)";

class FeedError extends Error {
  constructor(readonly kind: "timeout" | "rate-limited" | "too-large" | "invalid" | "unavailable") {
    super(kind);
  }
}

export class BriefSelectionError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function removeControlCharacters(value: string) {
  return [...value].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127 ? " " : character;
  }).join("");
}

function plainText(value: string) {
  return removeControlCharacters(decodeEntities(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function readerText(value: string) {
  return removeControlCharacters(decodeEntities(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|blockquote|h[1-6])\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clippedContent(value: string, characters: number) {
  const result = readerText(value);
  if (result.length <= characters) return result;
  return `${result.slice(0, characters - 1).trimEnd()}…`;
}

function clipped(value: string, characters: number, words?: number) {
  let result = plainText(value);
  if (words) result = result.split(/\s+/).slice(0, words).join(" ");
  if (result.length <= characters) return result;
  return `${result.slice(0, characters - 1).trimEnd()}…`;
}

function tag(entry: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = entry.match(new RegExp(`<(?:[\\w.-]+:)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escaped}>`, "i"));
    if (match) return match[1];
  }
  return "";
}

function unprefixedTag(entry: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return entry.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"))?.[1] ?? "";
}

function linkFromEntry(entry: string) {
  const rssLink = tag(entry, ["link"]);
  if (rssLink && /^\s*(?:<!\[CDATA\[)?https?:/i.test(rssLink)) return plainText(rssLink);
  const atomLinks = entry.matchAll(/<(?:[\w.-]+:)?link\b([^>]*)\/?\s*>/gi);
  for (const atomLink of atomLinks) {
    const attributes = atomLink[1];
    const href = attributes.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const relation = attributes.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (href && (!relation || relation === "alternate")) return decodeEntities(href).trim();
  }
  const guid = tag(entry, ["guid", "id"]);
  return /^\s*(?:<!\[CDATA\[)?https?:/i.test(guid) ? plainText(guid) : "";
}

function allowedHttpsUrl(value: string, allowedHosts: string[]) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    const allowed = allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return allowed ? url.toString() : "";
  } catch {
    return "";
  }
}

function stableId(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function publishedAt(value: string) {
  const parsed = Date.parse(plainText(value));
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

export function parseBriefFeed(xml: string, feed: BriefFeed): BriefItem[] {
  if (new TextEncoder().encode(xml).byteLength > BRIEF_LIMITS.feedBytes) throw new FeedError("too-large");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new FeedError("invalid");
  const entries = (xml.match(/<(?:[\w.-]+:)?item\b[\s\S]*?<\/(?:[\w.-]+:)?item>/gi)
    ?? xml.match(/<(?:[\w.-]+:)?entry\b[\s\S]*?<\/(?:[\w.-]+:)?entry>/gi)
    ?? [])
    .slice(0, BRIEF_LIMITS.feedItems);
  const items: BriefItem[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const title = clipped(tag(entry, ["title"]), BRIEF_LIMITS.titleCharacters);
    const url = allowedHttpsUrl(linkFromEntry(entry), feed.articleHosts);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    const rawSummary = tag(entry, ["description", "summary"]);
    const summary = clipped(
      rawSummary,
      BRIEF_LIMITS.summaryCharacters,
      BRIEF_LIMITS.summaryWords,
    );
    const encodedContent = clippedContent(
      tag(entry, ["encoded"]) || unprefixedTag(entry, "content"),
      BRIEF_LIMITS.contentCharacters,
    );
    const descriptionContent = clippedContent(rawSummary, BRIEF_LIMITS.contentCharacters);
    const suppliedContent = [encodedContent, descriptionContent]
      .filter(Boolean)
      .sort((left, right) => right.length - left.length)[0] ?? "";
    const content = suppliedContent.length >= 80 && suppliedContent.length > summary.length + 20
      ? suppliedContent
      : undefined;
    items.push({
      id: `${feed.id}-${stableId(url)}`,
      title,
      summary: summary || undefined,
      content,
      publishedAt: publishedAt(tag(entry, ["pubDate", "published", "updated", "dc:date"])),
      url,
      source: { id: feed.id, name: feed.name, homepage: feed.homepage },
    });
  }
  return items;
}

async function readBoundedBody(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > BRIEF_LIMITS.feedBytes) throw new FeedError("too-large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > BRIEF_LIMITS.feedBytes) {
      await reader.cancel();
      throw new FeedError("too-large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchFeed(feed: BriefFeed) {
  const expectedUrl = new URL(feed.feedUrl);
  const configured = BRIEF_FEEDS.some((candidate) => candidate.feedUrl === expectedUrl.toString());
  if (!configured || expectedUrl.protocol !== "https:") throw new FeedError("invalid");
  try {
    // Workerd's fetch implementation accepts the reviewed URL as a string,
    // but rejects a Node URL object before making the request. Netlify's
    // production runtime accepts both, which hid the local failure.
    const response = await fetch(expectedUrl.toString(), {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
        "User-Agent": APP_USER_AGENT,
      },
      // `manual` is the only cross-runtime way to prevent automatic redirects:
      // Workerd rejects `redirect: "error"`, while Node and Netlify accept it.
      // The non-2xx check below rejects the redirect response itself.
      redirect: "manual",
      signal: AbortSignal.timeout(BRIEF_LIMITS.requestTimeoutMs),
    });
    if (response.status === 429) throw new FeedError("rate-limited");
    if (!response.ok) throw new FeedError("unavailable");
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !/xml|rss|atom|text\/plain/.test(contentType)) throw new FeedError("invalid");
    return await readBoundedBody(response);
  } catch (error) {
    if (error instanceof FeedError) throw error;
    const failure = error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
    console.warn(`[brief] ${feed.id} fetch failed: ${failure}`);
    if (isRecord(error) && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new FeedError("timeout");
    }
    throw new FeedError("unavailable");
  }
}

function sourceError(error: unknown) {
  if (error instanceof FeedError && error.kind === "timeout") return "Feed timed out.";
  if (error instanceof FeedError && error.kind === "rate-limited") return "Feed is rate-limiting requests.";
  if (error instanceof FeedError && error.kind === "too-large") return "Feed exceeded the safety size limit.";
  if (error instanceof FeedError && error.kind === "invalid") return "Feed returned invalid data.";
  return "Feed is temporarily unavailable.";
}

async function loadFeed(feed: BriefFeed, dependencies: BriefDependencies, now: Date) {
  const cached = cache.get(feed.id);
  if (cached && cached.freshUntil > now.getTime()) {
    return {
      items: cached.items,
      source: {
        id: feed.id,
        name: feed.name,
        homepage: feed.homepage,
        termsUrl: feed.termsUrl,
        state: "cached" as const,
        fetchedAt: cached.fetchedAt,
        itemCount: cached.items.length,
      },
    };
  }

  try {
    const xml = await (dependencies.fetchFeed ?? fetchFeed)(feed);
    const items = parseBriefFeed(xml, feed);
    if (!items.length) throw new FeedError("invalid");
    const fetchedAt = now.toISOString();
    cache.set(feed.id, {
      fetchedAt,
      freshUntil: now.getTime() + BRIEF_LIMITS.freshSeconds * 1_000,
      staleUntil: now.getTime() + BRIEF_LIMITS.staleSeconds * 1_000,
      items,
    });
    return {
      items,
      source: {
        id: feed.id,
        name: feed.name,
        homepage: feed.homepage,
        termsUrl: feed.termsUrl,
        state: "live" as const,
        fetchedAt,
        itemCount: items.length,
      },
    };
  } catch (error) {
    if (cached && cached.staleUntil > now.getTime()) {
      return {
        items: cached.items,
        source: {
          id: feed.id,
          name: feed.name,
          homepage: feed.homepage,
          termsUrl: feed.termsUrl,
          state: "stale" as const,
          fetchedAt: cached.fetchedAt,
          itemCount: cached.items.length,
          error: sourceError(error),
        },
      };
    }
    return {
      items: [] as BriefItem[],
      source: {
        id: feed.id,
        name: feed.name,
        homepage: feed.homepage,
        termsUrl: feed.termsUrl,
        state: "unavailable" as const,
        itemCount: 0,
        error: sourceError(error),
      },
    };
  }
}

export type BriefSelection = {
  country: BriefCountry;
  topic: BriefTopic;
  feedIds?: readonly string[];
};

function sameFeedSelection(left: readonly BriefFeed[], right: readonly BriefFeed[]) {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right.map((feed) => feed.id));
  return left.every((feed) => rightIds.has(feed.id));
}

function feedsForSelection(selection: BriefSelection, registry: readonly BriefFeed[]) {
  const preset = feedsFor(selection.country, selection.topic, registry);
  if (!selection.feedIds) return { feeds: preset, preset: true };
  if (!selection.feedIds.length || selection.feedIds.length > BRIEF_MAX_SELECTED_FEEDS) {
    throw new BriefSelectionError(`Select between 1 and ${BRIEF_MAX_SELECTED_FEEDS} reviewed feeds.`);
  }
  const byId = new Map(registry.map((feed) => [feed.id, feed]));
  const requested = [...new Set(selection.feedIds)].map((feedId) => byId.get(feedId));
  if (requested.some((feed) => !feed)) throw new BriefSelectionError("Invalid reviewed feed selection.");
  const uniqueByUrl = new Map<string, BriefFeed>();
  for (const feed of requested as BriefFeed[]) {
    if (!uniqueByUrl.has(feed.feedUrl)) uniqueByUrl.set(feed.feedUrl, feed);
  }
  const feeds = [...uniqueByUrl.values()];
  return { feeds, preset: sameFeedSelection(feeds, preset) };
}

export async function aggregateBriefSelection(
  selection: BriefSelection,
  dependencies: BriefDependencies = {},
): Promise<BriefPayload> {
  const { country, topic } = selection;
  const registry = dependencies.registry ?? BRIEF_FEEDS;
  const selected = feedsForSelection(selection, registry);
  const feeds = selected.feeds.slice(0, BRIEF_LIMITS.feedsPerRequest);
  if (!feeds.length) throw new BriefSelectionError("This country and topic combination is not available.");
  const now = (dependencies.now ?? (() => new Date()))();
  const results = await Promise.all(feeds.map((feed) => loadFeed(feed, dependencies, now)));
  const feedsByRecency = results.map((result) => [...result.items]
    .sort((left, right) => (Date.parse(right.publishedAt ?? "") || 0) - (Date.parse(left.publishedAt ?? "") || 0)));
  const seenUrls = new Set<string>();
  const items: BriefItem[] = [];
  for (let itemIndex = 0; items.length < BRIEF_LIMITS.resultItems; itemIndex += 1) {
    let foundAtThisIndex = false;
    for (const feedItems of feedsByRecency) {
      const item = feedItems[itemIndex];
      if (!item) continue;
      foundAtThisIndex = true;
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      items.push(item);
      if (items.length === BRIEF_LIMITS.resultItems) break;
    }
    if (!foundAtThisIndex) break;
  }
  const sources = results.map((result) => result.source);
  const editionTitle = selected.preset
    ? `${BRIEF_TOPIC_LABELS[topic]} · ${BRIEF_COUNTRY_LABELS[country]}`
    : feeds.length === 1
      ? `${feeds[0].name} · ${BRIEF_TOPIC_LABELS[feeds[0].topic]}`
      : `Combined news · ${feeds.length} feeds`;

  return {
    country,
    countryLabel: BRIEF_COUNTRY_LABELS[country],
    topic,
    topicLabel: BRIEF_TOPIC_LABELS[topic],
    editionTitle,
    editionSlug: selected.preset ? `${country.toLowerCase()}-${topic}` : "selected-feeds",
    feedIds: feeds.map((feed) => feed.id),
    selectionMode: selected.preset ? "preset" : "feeds",
    generatedAt: now.toISOString(),
    partial: sources.some((source) => source.state === "unavailable" || source.state === "stale"),
    personalUseOnly: true,
    items,
    sources,
    limits: {
      maxItems: BRIEF_LIMITS.resultItems,
      maxSummaryCharacters: BRIEF_LIMITS.summaryCharacters,
      maxContentCharacters: BRIEF_LIMITS.contentCharacters,
    },
  };
}

export async function aggregateBrief(
  country: BriefCountry,
  topic: BriefTopic,
  dependencies: BriefDependencies = {},
) {
  return aggregateBriefSelection({ country, topic }, dependencies);
}

export function clearBriefCacheForTests() {
  cache.clear();
}
