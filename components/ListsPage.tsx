"use client";

import { useCallback, useEffect, useState } from "react";
import type { Book, SearchPayload } from "./BookCard";
import { CURATED_LIST_DESCRIPTIONS, CURATED_LISTS, type CuratedBook } from "./curatedLists";
import styles from "./ListsPage.module.css";

type SourceState = "live" | "stale" | "unavailable";

type LiveListItem = {
  id: string;
  title: string;
  authors: string[];
  cover?: string;
  publishedAt?: string;
  sourceUrl: string;
  actionUrl: string;
  actionLabel: string;
  access: "download" | "borrow-preview";
  metric?: { label: string; value: number };
  rights: { jurisdiction: "US" | "varies"; note: string };
};

type LiveList = {
  id: string;
  title: string;
  description: string;
  source: { name: string; url: string; documentation: string };
  state: SourceState;
  updatedAt: string;
  items: LiveListItem[];
  error?: string;
};

type LiveListsPayload = {
  generatedAt: string;
  refreshAfterSeconds: number;
  partial: boolean;
  lists: LiveList[];
};

const CACHE_KEY = "libreleaf-live-lists-v1";
const MAX_STALE_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const RESOLVER_CACHE_KEY = "libreleaf-list-access-v2";
const RESOLVER_CACHE_MS = 24 * 60 * 60 * 1_000;
const RESOLVER_CACHE_LIMIT = 80;

type ResolvedRoute = {
  label: string;
  url: string;
  access: Book["access"];
  source: string;
};

type ResolvedCuratedBook = {
  title: string;
  source: string;
  routes: ResolvedRoute[];
  fullResultUrl: string;
};

type ResolverState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: ResolvedCuratedBook }
  | { status: "error"; message: string };

const resolvedBooks = new Map<string, { savedAt: number; result: ResolvedCuratedBook }>();
const resolverRequests = new Map<string, Promise<ResolvedCuratedBook>>();

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update time unknown";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resolverUrl(book: Pick<LiveListItem, "title"> | CuratedBook) {
  return `/search?q=${encodeURIComponent(book.title)}&by=title`;
}

function normalise(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-GB").replace(/[^a-z0-9]+/g, " ").trim();
}

function personKey(value: string) {
  return normalise(value).split(" ").filter(Boolean).sort().join(" ");
}

function resolverCacheId(book: CuratedBook) {
  return `${normalise(book.title)}|${normalise(book.author)}`;
}

function readResolverCache(book: CuratedBook) {
  const id = resolverCacheId(book);
  const memory = resolvedBooks.get(id);
  if (memory && Date.now() - memory.savedAt <= RESOLVER_CACHE_MS) return memory.result;
  if (typeof window === "undefined") return null;
  try {
    const cache = JSON.parse(window.localStorage.getItem(RESOLVER_CACHE_KEY) ?? "{}") as Record<string, { savedAt?: number; result?: ResolvedCuratedBook }>;
    const entry = cache[id];
    if (!entry?.savedAt || !entry.result || Date.now() - entry.savedAt > RESOLVER_CACHE_MS) return null;
    resolvedBooks.set(id, { savedAt: entry.savedAt, result: entry.result });
    return entry.result;
  } catch {
    return null;
  }
}

function writeResolverCache(book: CuratedBook, result: ResolvedCuratedBook) {
  const id = resolverCacheId(book);
  const entry = { savedAt: Date.now(), result };
  resolvedBooks.set(id, entry);
  if (typeof window === "undefined") return;
  try {
    const current = JSON.parse(window.localStorage.getItem(RESOLVER_CACHE_KEY) ?? "{}") as Record<string, { savedAt: number; result: ResolvedCuratedBook }>;
    const compact = Object.fromEntries(
      Object.entries({ ...current, [id]: entry })
        .filter(([, value]) => Date.now() - value.savedAt <= RESOLVER_CACHE_MS)
        .sort((left, right) => right[1].savedAt - left[1].savedAt)
        .slice(0, RESOLVER_CACHE_LIMIT),
    );
    window.localStorage.setItem(RESOLVER_CACHE_KEY, JSON.stringify(compact));
  } catch {
    // Storage is an optimisation; resolving still works when it is unavailable.
  }
}

function chooseBook(results: Book[], wanted: CuratedBook) {
  const title = normalise(wanted.title);
  const author = normalise(wanted.author);
  const authorKey = personKey(wanted.author);
  return [...results].sort((left, right) => {
    const score = (book: Book) => (normalise(book.title) === title ? 4 : 0)
      + (book.authors.some((name) => personKey(name) === authorKey || author.includes(normalise(name)) || normalise(name).includes(author)) ? 2 : 0)
      + (book.offers?.length ? 1 : 0);
    return score(right) - score(left);
  })[0];
}

function routesForResolvedBook(book: Book) {
  const routes: ResolvedRoute[] = [
    ...(book.offers ?? []).map((offer) => ({ label: offer.label, url: offer.url, access: offer.access, source: offer.source })),
    ...book.formats.map((format) => {
      const access = format.label.toLocaleLowerCase().includes("read online") ? "read" as const : "download" as const;
      return { label: access === "download" ? `Download ${format.label}` : format.label, url: format.url, access, source: book.source };
    }),
  ];
  const unique = routes.filter((route, index, all) => safeHttpsUrl(route.url) && all.findIndex((item) => item.url === route.url) === index);
  const representative: ResolvedRoute[] = [];
  for (const access of ["download", "read", "borrow", "preview", "listen"] satisfies Book["access"][]) {
    const match = unique.find((route) => route.access === access);
    if (match) representative.push(match);
  }
  for (const route of unique) if (!representative.includes(route)) representative.push(route);
  return representative;
}

async function resolveCuratedBook(book: CuratedBook) {
  const cached = readResolverCache(book);
  if (cached) return cached;
  const id = resolverCacheId(book);
  const active = resolverRequests.get(id);
  if (active) return active;

  const request = fetch(`/api/search?q=${encodeURIComponent(book.title)}&by=title&region=GB`)
    .then(async (response) => {
      if (!response.ok) throw new Error("Access routes are temporarily unavailable.");
      const payload = await response.json() as SearchPayload;
      const match = chooseBook(payload.books, book);
      if (!match) throw new Error("No matching work was returned.");
      const result = {
        title: match.title,
        source: match.source,
        routes: routesForResolvedBook(match),
        fullResultUrl: resolverUrl(book),
      } satisfies ResolvedCuratedBook;
      writeResolverCache(book, result);
      return result;
    })
    .finally(() => resolverRequests.delete(id));
  resolverRequests.set(id, request);
  return request;
}

function safeHttpsUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function sourceStatus(state: SourceState) {
  if (state === "live") return "Live";
  if (state === "stale") return "Cached";
  return "Unavailable";
}

function metric(item: LiveListItem) {
  if (item.metric) return `${new Intl.NumberFormat("en-GB").format(item.metric.value)} ${item.metric.label}`;
  if (item.publishedAt) {
    const year = Number(item.publishedAt);
    if (Number.isInteger(year) && String(year) === item.publishedAt) return String(year);
    const date = new Date(item.publishedAt);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(date);
  }
  return item.access === "download" ? "File route" : "Check access";
}

function cachedPayload(): LiveListsPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null") as { savedAt?: number; payload?: LiveListsPayload } | null;
    if (!cached?.savedAt || !cached.payload || Date.now() - cached.savedAt > MAX_STALE_AGE_MS || !Array.isArray(cached.payload.lists)) return null;
    return {
      ...cached.payload,
      partial: true,
      lists: cached.payload.lists.map((list) => ({ ...list, state: list.items.length ? "stale" as const : "unavailable" as const })),
    };
  } catch {
    return null;
  }
}

function CuratedItem({ book, tone }: { book: CuratedBook; tone: number }) {
  const [resolver, setResolver] = useState<ResolverState>({ status: "idle" });

  function loadAccess() {
    if (resolver.status === "loading") return;
    const cached = readResolverCache(book);
    if (cached) {
      setResolver({ status: "ready", result: cached });
      return;
    }
    setResolver({ status: "loading" });
    void resolveCuratedBook(book)
      .then((result) => setResolver({ status: "ready", result }))
      .catch((reason: unknown) => setResolver({ status: "error", message: reason instanceof Error ? reason.message : "Access routes are temporarily unavailable." }));
  }

  return (
    <details className={styles.curatedItem} onToggle={(event) => { if (event.currentTarget.open && resolver.status === "idle") loadAccess(); }}>
      <summary>
        <span className={styles.poster} data-tone={tone} aria-hidden="true">
          <small>LIBRELEAF</small>
          <strong>{book.title}</strong>
          <span>{book.author}</span>
        </span>
        <span className={styles.curatedText}>
          <strong>{book.title}</strong>
          <span>{book.author}</span>
        </span>
        <span className={styles.plus} aria-hidden="true">+</span>
      </summary>
      <div className={styles.accessMenu}>
        {resolver.status === "idle" || resolver.status === "loading" ? <p role="status">Finding access…</p> : null}
        {resolver.status === "ready" ? (
          <>
            <span className={styles.resolvedSource}>{resolver.result.source}</span>
            {resolver.result.routes.slice(0, 3).map((route) => (
              <a className={route.access === "download" ? styles.resolvedPrimary : undefined} href={route.url} target="_blank" rel="noreferrer" download={route.access === "download"} key={route.url}>
                {route.access === "download" ? "Download" : route.access === "borrow" ? "Borrow" : route.access === "listen" ? "Listen" : route.access === "preview" ? "Preview" : "Read"}
                <small>{route.label} · {route.source}</small>
                <span aria-hidden="true">{route.access === "download" ? "↓" : "↗"}</span>
              </a>
            ))}
            {!resolver.result.routes.length ? <p>No direct route in this result.</p> : null}
            <a className={styles.fullResult} href={resolver.result.fullResultUrl}>Full work result <span aria-hidden="true">→</span></a>
          </>
        ) : null}
        {resolver.status === "error" ? <><p role="alert">{resolver.message}</p><button type="button" onClick={loadAccess}>Retry</button><a className={styles.fullResult} href={resolverUrl(book)}>Open full search →</a></> : null}
      </div>
    </details>
  );
}

function LiveListRow({ item, rank, source }: { item: LiveListItem; rank: number; source: string }) {
  const cover = safeHttpsUrl(item.cover);
  const actionUrl = safeHttpsUrl(item.actionUrl);
  const sourceUrl = safeHttpsUrl(item.sourceUrl);

  return (
    <li className={styles.row}>
      <details className={styles.liveItem}>
        <summary>
          <span className={styles.rank} aria-label={`Rank ${rank}`}>{String(rank).padStart(2, "0")}</span>
          <span className={styles.cover}>
            {cover ? <img src={cover} alt="" loading="lazy" /> : <span aria-hidden="true">{item.title.slice(0, 1)}</span>}
          </span>
          <span className={styles.book}>
            <span className={styles.signal}>{metric(item)}</span>
            <strong>{item.title}</strong>
            <span className={styles.author}>{item.authors.length ? item.authors.join(", ") : "Author not listed"}</span>
          </span>
          <span className={styles.plus} aria-hidden="true">+</span>
        </summary>
        <div className={styles.liveAccessMenu}>
          {actionUrl ? <a className={styles.primary} href={actionUrl} target="_blank" rel="noreferrer">{item.actionLabel} <span aria-hidden="true">↗</span></a> : null}
          <a href={resolverUrl(item)}>Compare routes</a>
          {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">Source record · {source} ↗</a> : null}
          <details className={styles.rights}>
            <summary>Rights · {item.rights.jurisdiction === "US" ? "US assessment" : "varies"}</summary>
            <p>{item.rights.note}</p>
          </details>
        </div>
      </details>
    </li>
  );
}

export default function ListsPage() {
  const [data, setData] = useState<LiveListsPayload | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const refreshAfterSeconds = data?.refreshAfterSeconds;

  const load = useCallback(async (manual = false, signal?: AbortSignal) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/lists", { signal, cache: manual ? "reload" : "default" });
      if (!response.ok) throw new Error("Live lists are unavailable.");
      const payload = await response.json() as LiveListsPayload;
      if (!Array.isArray(payload.lists)) throw new Error("Live lists returned an invalid response.");
      setData(payload);
      setError("");
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), payload }));
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Live lists are unavailable.");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setData(cachedPayload());
    const controller = new AbortController();
    void load(false, controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!refreshAfterSeconds) return;
    const interval = window.setInterval(() => void load(), Math.max(refreshAfterSeconds, 300) * 1_000);
    return () => window.clearInterval(interval);
  }, [refreshAfterSeconds, load]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">CURATED + LIVE</p>
          <h1>Book lists</h1>
        </div>
      </header>

      <div className={styles.topics}>
        {CURATED_LISTS.map((list, listIndex) => (
          <details className={styles.topic} key={list.id}>
            <summary className={styles.topicSummary}>
              <span className={styles.topicCopy}>
                <h2>{list.title}</h2>
                <span>{CURATED_LIST_DESCRIPTIONS[list.id]}</span>
              </span>
              <span className={styles.previewStack} aria-hidden="true">
                {list.books.slice(0, 4).map((book, bookIndex) => (
                  <span data-tone={(listIndex + bookIndex) % 6} key={book.title}>{book.title.slice(0, 1)}</span>
                ))}
              </span>
              <span className={styles.topicCount}>{list.books.length}</span>
              <span className={styles.chevron} aria-hidden="true">↓</span>
            </summary>
            <div className={styles.topicGrid}>
              {list.books.map((book, bookIndex) => <CuratedItem book={book} tone={(listIndex + bookIndex) % 6} key={`${list.id}-${book.title}`} />)}
            </div>
          </details>
        ))}
      </div>

      <section className={styles.liveBlock} aria-labelledby="live-lists-heading">
        <div className={styles.liveHeading}>
          <div><p className="eyebrow">CATALOGUE FEEDS</p><h2 id="live-lists-heading">Live lists</h2></div>
          <div className={styles.toolbar} aria-live="polite">
            <span>{data ? `Checked ${formatTimestamp(data.generatedAt)}` : error ? "Feeds offline" : "Checking feeds…"}</span>
            <button type="button" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Checking…" : "Refresh"}</button>
          </div>
        </div>
        {error ? <p className={styles.inlineError}>{error}{data ? " Showing cached data." : " Curated lists remain available."}</p> : null}

        {data?.lists.some((list) => list.items.length) ? (
          <div className={styles.liveLists}>
            {data.lists.filter((list) => list.items.length).map((list) => (
              <details className={styles.liveSection} key={list.id}>
                <summary className={styles.liveSectionSummary}>
                  <span className={`${styles.state} ${styles[list.state]}`}>{sourceStatus(list.state)}</span>
                  <h3>{list.title}</h3>
                  <span className={styles.count}>{list.items.length}</span>
                  <span className={styles.chevron} aria-hidden="true">↓</span>
                </summary>
                <div className={styles.liveSectionBody}>
                  <div className={styles.sourceLine}>
                    <span>{list.source.name}</span>
                    <time dateTime={list.updatedAt}>{formatTimestamp(list.updatedAt)}</time>
                    <a href={safeHttpsUrl(list.source.documentation) ?? "#"} target="_blank" rel="noreferrer">Feed docs ↗</a>
                  </div>
                  {list.items.length ? (
                    <ol className={styles.grid}>
                      {list.items.map((item, index) => <LiveListRow key={item.id} item={item} rank={index + 1} source={list.source.name} />)}
                    </ol>
                  ) : <p className={styles.sourceError}>{list.error ?? "No current records."}</p>}
                  {list.error && list.items.length ? <p className={styles.staleNote}>{list.error}</p> : null}
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </section>

      <aside className={styles.policy}><strong>Rights vary by edition and location.</strong><p>Source labels describe access. Check local law before downloading.</p></aside>
    </main>
  );
}
