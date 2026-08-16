"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { SiteNav } from "../app/components/SiteNav";
import { BookCard, type Book, type CatalogueSource, type SearchPayload } from "./BookCard";
import styles from "./SearchResultsPage.module.css";

type SearchBy = "all" | "title" | "author" | "subject";
type RightsRegion = "GB" | "US" | "GLOBAL";
type AccessFilter = "all" | Book["access"] | "saved";
type Sort = "relevance" | "title" | "oldest" | "newest";

type LocationState = {
  query: string;
  by: SearchBy;
  savedOnly: boolean;
  region: RightsRegion;
  workId: string;
};

const responseCache = new Map<string, SearchPayload>();
const validSearchFields = new Set<SearchBy>(["all", "title", "author", "subject"]);
const validRegions = new Set<RightsRegion>(["GB", "US", "GLOBAL"]);
const RESULTS_BATCH_SIZE = 24;
const RRF_K = 60;

function normalise(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function bookKey(book: Book) {
  if (book.canonicalId) return book.canonicalId;
  const title = normalise(book.title);
  const author = normalise(book.authors[0] ?? "").split(" ").filter(Boolean).sort().join(" ");
  return title && author ? `${title}|${author}` : book.workKey ?? book.id;
}

function savedKey(book: Book) {
  return book.canonicalId ?? book.id;
}

function rankingBase(book: Book) {
  return (book.ranking?.sourceRanks ?? []).reduce((score, item) => score + 1 / (RRF_K + item.rank), 0);
}

function mergeRanking(existing: Book, incoming: Book): Book["ranking"] {
  if (!existing.ranking) return incoming.ranking;
  if (!incoming.ranking) return existing.ranking;
  const bestBySource = new Map<CatalogueSource, number>();
  for (const item of [...existing.ranking.sourceRanks, ...incoming.ranking.sourceRanks]) {
    const current = bestBySource.get(item.source);
    if (current === undefined || item.rank < current) bestBySource.set(item.source, item.rank);
  }
  const sourceRanks = [...bestBySource]
    .map(([source, rank]) => ({ source, rank }))
    .sort((left, right) => left.rank - right.rank || left.source.localeCompare(right.source));
  const boost = Math.max(
    0,
    existing.ranking.score - rankingBase(existing),
    incoming.ranking.score - rankingBase(incoming),
  );
  const score = Math.round((sourceRanks.reduce((total, item) => total + 1 / (RRF_K + item.rank), 0) + boost) * 1_000_000) / 1_000_000;
  const reasons = [
    ...sourceRanks.map((item) => `Ranked #${item.rank} by ${item.source}.`),
    ...(sourceRanks.length > 1 ? [`Confirmed by ${sourceRanks.length} independent catalogues.`] : []),
    ...existing.ranking.reasons.filter((reason) => !reason.startsWith("Ranked #") && !reason.startsWith("Confirmed by ")),
    ...incoming.ranking.reasons.filter((reason) => !reason.startsWith("Ranked #") && !reason.startsWith("Confirmed by ")),
  ].filter((reason, index, all) => all.indexOf(reason) === index);
  return { method: "rrf-v1", score, sourceRanks, reasons };
}

function mergeBooks(current: Book[], incoming: Book[]) {
  const merged = new Map<string, Book>();

  for (const book of [...current, ...incoming]) {
    const key = bookKey(book);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, book);
      continue;
    }

    const offers = [...(existing.offers ?? []), ...(book.offers ?? [])].filter((offer, index, all) => all.findIndex((item) => item.url === offer.url) === index);
    const sourceRecords = [...(existing.sourceRecords ?? []), ...(book.sourceRecords ?? [])].filter((record, index, all) => all.findIndex((item) => item.source === record.source && item.recordId === record.recordId) === index);
    const why = [...(existing.why ?? []), ...(book.why ?? [])].filter((reason, index, all) => all.indexOf(reason) === index);
    const formats = [...existing.formats, ...book.formats].filter((format, index, all) => all.findIndex((item) => item.label === format.label && item.url === format.url) === index);
    const sources = sourceRecords.map((record) => record.source).filter((item, index, all) => all.indexOf(item) === index);
    const access = offers.some((offer) => offer.access === "download")
      ? "download"
      : offers.some((offer) => offer.access === "borrow")
        ? "borrow"
        : offers.some((offer) => offer.access === "read")
          ? "read"
          : offers.some((offer) => offer.access === "listen")
            ? "listen"
            : book.access;

    merged.set(key, {
      ...existing,
      ...book,
      cover: existing.cover ?? book.cover,
      offers,
      sourceRecords,
      formats,
      source: sources.length > 1 ? sources.join(" + ") : sources[0] ?? book.source,
      access,
      why,
      clusterConfidence: existing.clusterConfidence === "exact" || book.clusterConfidence === "exact" ? "exact" : book.clusterConfidence ?? existing.clusterConfidence,
      canonicalId: existing.canonicalId ?? book.canonicalId,
      canonicalUrl: existing.canonicalUrl ?? book.canonicalUrl,
      ranking: mergeRanking(existing, book),
    });
  }

  return [...merged.values()];
}

function countsFor(books: Book[]) {
  return {
    total: books.length,
    download: books.filter((book) => book.access === "download").length,
    borrow: books.filter((book) => book.access === "borrow").length,
    preview: books.filter((book) => book.access === "preview").length,
    read: books.filter((book) => book.access === "read").length,
    listen: books.filter((book) => book.access === "listen").length,
  };
}

function mergePayload(current: SearchPayload, incoming: SearchPayload): SearchPayload {
  const books = mergeBooks(current.books, incoming.books);
  return {
    ...current,
    ...incoming,
    books,
    counts: countsFor(books),
    upstreamTotals: incoming.upstreamTotals ?? current.upstreamTotals,
    sources: incoming.sources ?? current.sources,
  };
}

function bookFormats(book: Book) {
  return [
    ...book.formats.map((item) => item.label),
    ...(book.offers ?? []).flatMap((offer) => offer.format ? [offer.format] : []),
  ];
}

function sourceIssue(source: string, status: string | undefined) {
  if (!status || status === "ok" || status === "exhausted") return null;
  if (status === "timeout") return `${source} timed out`;
  if (status === "rate-limited") return `${source} rate-limited this request`;
  return `${source} did not respond`;
}

function readLocation(): LocationState {
  if (typeof window === "undefined") return { query: "", by: "all", savedOnly: false, region: "GB", workId: "" };
  const params = new URLSearchParams(window.location.search);
  const rawBy = params.get("by") as SearchBy | null;
  const rawRegion = params.get("region") as RightsRegion | null;
  const rawWorkId = params.get("work") ?? "";

  return {
    query: params.get("q")?.trim() ?? "",
    by: rawBy && validSearchFields.has(rawBy) ? rawBy : "all",
    savedOnly: params.get("view") === "saved",
    region: rawRegion && validRegions.has(rawRegion) ? rawRegion : "GB",
    workId: /^llw1\.[A-Za-z0-9_-]+$/.test(rawWorkId) && rawWorkId.length <= 1_024 ? rawWorkId : "",
  };
}

function writeLocation(query: string, by: SearchBy, region: RightsRegion, savedOnly = false, workId = "") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (by !== "all") params.set("by", by);
  if (region !== "GB") params.set("region", region);
  if (savedOnly) params.set("view", "saved");
  if (workId) params.set("work", workId);
  const suffix = params.toString();
  window.history.pushState({}, "", suffix ? `/search?${suffix}` : "/search");
}

function loadSavedBooks() {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem("libreleaf-saved") ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default function SearchResultsPage() {
  const [location, setLocation] = useState<LocationState>({ query: "", by: "all", savedOnly: false, region: "GB", workId: "" });
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftBy, setDraftBy] = useState<SearchBy>("all");
  const [draftRegion, setDraftRegion] = useState<RightsRegion>("GB");
  const [data, setData] = useState<SearchPayload | null>(null);
  const [filter, setFilter] = useState<AccessFilter>("all");
  const [source, setSource] = useState<"all" | CatalogueSource>("all");
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState<Sort>("relevance");
  const [visibleCount, setVisibleCount] = useState(RESULTS_BATCH_SIZE);
  const [saved, setSaved] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const loadMoreController = useRef<AbortController | null>(null);

  useEffect(() => {
    function syncFromLocation() {
      const next = readLocation();
      setLocation(next);
      setDraft(next.query);
      setDraftBy(next.by);
      setDraftRegion(next.region);
      setFilter(next.savedOnly ? "saved" : "all");
      setVisibleCount(RESULTS_BATCH_SIZE);
    }

    syncFromLocation();
    setSaved(loadSavedBooks());
    setReady(true);
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const requestKey = `${location.region}:${location.by}:${location.query.toLocaleLowerCase()}`;
    const cached = responseCache.get(requestKey);
    if (cached) {
      setData(cached);
      setVisibleCount(RESULTS_BATCH_SIZE);
      setError("");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    loadMoreController.current?.abort();
    setLoadingMore(false);
    setLoadMoreError("");
    setLoading(true);
    setError("");
    fetch(`/api/search?q=${encodeURIComponent(location.query)}&by=${location.by}&region=${location.region}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Search is temporarily unavailable.");
        return response.json();
      })
      .then((payload: SearchPayload) => {
        responseCache.set(requestKey, payload);
        setData(payload);
        setVisibleCount(RESULTS_BATCH_SIZE);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [location, ready]);

  const availableFormats = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.books.flatMap(bookFormats))).sort();
  }, [data]);

  const visibleBooks = useMemo(() => {
    if (!data) return [];
    let books = [...data.books];
    if (filter !== "all") books = filter === "saved"
      ? books.filter((book) => saved.includes(savedKey(book)) || saved.includes(book.id))
      : books.filter((book) => book.access === filter);
    if (source !== "all") books = books.filter((book) => book.source === source || book.sourceRecords?.some((record) => record.source === source));
    if (format !== "all") books = books.filter((book) => bookFormats(book).includes(format));
    if (sort === "relevance") books.sort((a, b) => (b.ranking?.score ?? 0) - (a.ranking?.score ?? 0));
    if (sort === "title") books.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "oldest") books.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    if (sort === "newest") books.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    if (location.workId) books.sort((a, b) => Number(b.canonicalId === location.workId) - Number(a.canonicalId === location.workId));
    return books;
  }, [data, filter, source, format, sort, saved, location.workId]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = draft.trim();
    writeLocation(query, draftBy, draftRegion);
    setLocation({ query, by: draftBy, savedOnly: false, region: draftRegion, workId: "" });
    setFilter("all");
    setSource("all");
    setFormat("all");
    setSort("relevance");
    setVisibleCount(RESULTS_BATCH_SIZE);
  }

  function selectFilter(next: AccessFilter) {
    setFilter(next);
    setVisibleCount(RESULTS_BATCH_SIZE);
    writeLocation(location.query, location.by, location.region, next === "saved", location.workId);
  }

  function toggleSaved(book: Book) {
    setSaved((current) => {
      const keys = [savedKey(book), book.id].filter((item, index, all) => all.indexOf(item) === index);
      const isSaved = keys.some((key) => current.includes(key));
      const next = isSaved
        ? current.filter((item) => !keys.includes(item))
        : [...current, savedKey(book)];
      window.localStorage.setItem("libreleaf-saved", JSON.stringify(next));
      return next;
    });
  }

  function loadMore() {
    if (!data || loadingMore) return;
    if (displayedBooks.length < visibleBooks.length) {
      setVisibleCount((current) => current + RESULTS_BATCH_SIZE);
      return;
    }
    if (!data.nextCursor) return;

    const controller = new AbortController();
    loadMoreController.current?.abort();
    loadMoreController.current = controller;
    setLoadingMore(true);
    setLoadMoreError("");

    const params = new URLSearchParams({ q: location.query, by: location.by, region: location.region, cursor: data.nextCursor });
    fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("More results are temporarily unavailable.");
        return response.json();
      })
      .then((payload: SearchPayload) => {
        setData((current) => {
          if (!current) return payload;
          const next = mergePayload(current, payload);
          responseCache.set(`${location.region}:${location.by}:${location.query.toLocaleLowerCase()}`, next);
          return next;
        });
        setVisibleCount((current) => current + RESULTS_BATCH_SIZE);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setLoadMoreError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMore(false);
      });
  }

  const hasFilters = filter !== "all" || source !== "all" || format !== "all" || sort !== "relevance";
  const resultLabel = location.query ? `Results for “${location.query}”` : filter === "saved" ? "Saved books" : "Browse open books";
  const displayedBooks = visibleBooks.slice(0, visibleCount);
  const canLoadMore = displayedBooks.length < visibleBooks.length || Boolean(data?.nextCursor);
  const sourceIssues = data?.sources
    ? [
        sourceIssue("Project Gutenberg", data.sources.gutenberg),
        sourceIssue("Open Library", data.sources.openLibrary),
        sourceIssue("Wikisource", data.sources.wikisource),
        sourceIssue("DOAB", data.sources.doab),
        sourceIssue("Library of Congress", data.sources.libraryOfCongress),
      ].filter(Boolean)
    : [];

  return (
    <main className={styles.page}>
      <SiteNav active={filter === "saved" ? "saved" : "search"} savedCount={saved.length} onSaved={() => selectFilter("saved")} />

      <header className={styles.searchHeader}>
        <div className={styles.headingRow}>
          <h1>Search books</h1>
          <p>One work view across source-labelled download, read, loan and preview routes.</p>
        </div>
        <form className={`search-box ${styles.form}`} onSubmit={search} role="search">
          <span aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor="results-search-by">Search field</label>
          <select id="results-search-by" name="by" value={draftBy} onChange={(event) => setDraftBy(event.target.value as SearchBy)}>
            <option value="all">Anywhere</option>
            <option value="title">Title</option>
            <option value="author">Author</option>
            <option value="subject">Subject</option>
          </select>
          <label className="sr-only" htmlFor="results-region">Rights context</label>
          <select id="results-region" name="region" value={draftRegion} onChange={(event) => setDraftRegion(event.target.value as RightsRegion)} title="Rights context">
            <option value="GB">UK context</option>
            <option value="US">US context</option>
            <option value="GLOBAL">Global / check locally</option>
          </select>
          <label className="sr-only" htmlFor="results-book-search">Search by title, author, or subject</label>
          <input id="results-book-search" name="q" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Title, author, or subject…" autoComplete="off" />
          <button type="submit">Search</button>
        </form>
      </header>

      <section className={`results-section ${styles.results}`} aria-live="polite" aria-busy={loading || loadingMore}>
        <div className={`results-heading ${styles.meta}`}>
          <div>
            <p className="eyebrow">CATALOGUE</p>
            <h2>{resultLabel}</h2>
          </div>
          {data ? <p className="result-count">Showing {displayedBooks.length} · {visibleBooks.length}{visibleBooks.length !== data.books.length ? ` match filters · ${data.books.length}` : ""} loaded{data.nextCursor ? " · more available" : ""}</p> : null}
        </div>
        {loading && data ? <p className={styles.working} role="status">Updating results…</p> : null}
        {sourceIssues.length ? <p className={styles.sourceNotice} role="status">Partial results: {sourceIssues.join("; ")}.</p> : null}
        {data?.rightsContext ? <p className={styles.sourceNotice}>Rights context: {data.rightsContext.label}. {data.rightsContext.note}</p> : null}

        <div className="filter-row" aria-label="Filter search results">
          <button className={filter === "all" ? "active" : ""} onClick={() => selectFilter("all")}>All <span>{data?.counts.total ?? 0}</span></button>
          <button className={filter === "download" ? "active" : ""} onClick={() => selectFilter("download")}>Free downloads <span>{data?.counts.download ?? 0}</span></button>
          <button className={filter === "borrow" ? "active" : ""} onClick={() => selectFilter("borrow")}>Borrow <span>{data?.counts.borrow ?? 0}</span></button>
          <button className={filter === "preview" ? "active" : ""} onClick={() => selectFilter("preview")}>Preview <span>{data?.counts.preview ?? 0}</span></button>
          <button className={filter === "read" ? "active" : ""} onClick={() => selectFilter("read")}>Read online <span>{data?.counts.read ?? 0}</span></button>
          <button className={filter === "saved" ? "active" : ""} onClick={() => selectFilter("saved")}>Saved <span>{saved.length}</span></button>
        </div>

        <div className="result-tools">
          <label>Source<select value={source} onChange={(event) => { setSource(event.target.value as typeof source); setVisibleCount(RESULTS_BATCH_SIZE); }}><option value="all">All catalogues</option><option value="Project Gutenberg">Project Gutenberg</option><option value="Open Library">Open Library</option><option value="Wikisource">Wikisource</option><option value="DOAB">DOAB</option><option value="Library of Congress">Library of Congress</option></select></label>
          <label>Format<select value={format} onChange={(event) => { setFormat(event.target.value); setVisibleCount(RESULTS_BATCH_SIZE); }}><option value="all">Every format</option>{availableFormats.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          <label>Sort<select value={sort} onChange={(event) => { setSort(event.target.value as Sort); setVisibleCount(RESULTS_BATCH_SIZE); }}><option value="relevance">Best match</option><option value="title">Title A–Z</option><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
          {hasFilters ? <button onClick={() => { setFilter("all"); setSource("all"); setFormat("all"); setSort("relevance"); setVisibleCount(RESULTS_BATCH_SIZE); writeLocation(location.query, location.by, location.region, false, location.workId); }}>Reset filters</button> : null}
        </div>

        {error ? <div className="status-card" role="alert"><strong>Could not load results.</strong><p>{error} Try again in a moment.</p></div> : null}
        {loading && !data ? <div className="book-grid loading-grid" role="status" aria-label="Loading search results">{Array.from({ length: 10 }).map((_, index) => <div className="loading-card" key={index}><div /><span /><span /></div>)}</div> : null}
        {!error && data && visibleBooks.length ? <div className="book-grid">{displayedBooks.map((book) => <BookCard key={bookKey(book)} book={book} saved={saved.includes(savedKey(book)) || saved.includes(book.id)} focused={Boolean(location.workId && book.canonicalId === location.workId)} onToggleSaved={() => toggleSaved(book)} />)}</div> : null}
        {loadMoreError ? <p className={styles.loadMoreError} role="alert">{loadMoreError}</p> : null}
        {!error && canLoadMore ? <button className={styles.loadMore} onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading more…" : "Load more"} <span aria-hidden="true">↓</span></button> : null}
        {!loading && !error && data && !visibleBooks.length ? <div className={`status-card ${styles.emptyHint}`}><strong>No matching books.</strong><p>{filter === "saved" ? "Save books from any result, or change the filter." : "Try a broader title, author, or subject."}</p></div> : null}
      </section>
    </main>
  );
}
