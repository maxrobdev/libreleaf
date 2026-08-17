"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { SiteNav } from "../app/components/SiteNav";
import { FEATURED_BOOKS } from "../lib/featured-books";
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

type CachedSearch = { payload: SearchPayload; storedAt: number };

const responseCache = new Map<string, CachedSearch>();
const validSearchFields = new Set<SearchBy>(["all", "title", "author", "subject"]);
const validRegions = new Set<RightsRegion>(["GB", "US", "GLOBAL"]);
const RESULTS_BATCH_SIZE = 24;
const RRF_K = 60;
const RESPONSE_CACHE_LIMIT = 32;
const COMPLETE_CACHE_MS = 5 * 60 * 1_000;
const PARTIAL_CACHE_MS = 15 * 1_000;
const SEARCH_SUGGESTIONS = ["Jane Austen", "Frankenstein", "Sherlock Holmes", "Virginia Woolf"];
const SUBJECT_SUGGESTIONS = ["Gothic fiction", "Detective fiction", "Romantic poetry", "Victorian literature", "Natural history", "Philosophical essays"];
const SEARCH_FIELD_OPTIONS: Array<{ value: SearchBy; label: string }> = [
  { value: "all", label: "Anywhere" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "subject", label: "Subject" },
];
const RIGHTS_OPTIONS: Array<{ value: RightsRegion; label: string }> = [
  { value: "GB", label: "United Kingdom" },
  { value: "US", label: "United States" },
  { value: "GLOBAL", label: "Global — check locally" },
];

function homePayload(region: RightsRegion): SearchPayload {
  const labels: Record<RightsRegion, string> = {
    GB: "United Kingdom",
    US: "United States",
    GLOBAL: "Global / check locally",
  };
  return {
    query: "",
    books: FEATURED_BOOKS,
    counts: countsFor(FEATURED_BOOKS),
    nextCursor: null,
    rightsContext: {
      region,
      label: labels[region],
      note: region === "US"
        ? "Project Gutenberg assesses these starter editions as public domain in the United States."
        : "Project Gutenberg assesses public-domain status under US law. Check the status of a work where you are.",
    },
  };
}

function apiSearchMode(by: SearchBy) {
  return by === "all" ? "q" : by;
}

function cachedResponse(key: string) {
  const cached = responseCache.get(key);
  if (!cached) return undefined;
  const lifetime = cached.payload.partial ? PARTIAL_CACHE_MS : COMPLETE_CACHE_MS;
  if (Date.now() - cached.storedAt > lifetime) {
    responseCache.delete(key);
    return undefined;
  }
  responseCache.delete(key);
  responseCache.set(key, cached);
  return cached.payload;
}

function rememberResponse(key: string, payload: SearchPayload) {
  responseCache.delete(key);
  responseCache.set(key, { payload, storedAt: Date.now() });
  while (responseCache.size > RESPONSE_CACHE_LIMIT) {
    const oldest = responseCache.keys().next().value as string | undefined;
    if (!oldest) break;
    responseCache.delete(oldest);
  }
}

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
  const hasAccess = (book: Book, access: Book["access"]) => book.access === access || (book.offers ?? []).some((offer) => offer.access === access);
  return {
    total: books.length,
    download: books.filter((book) => hasAccess(book, "download")).length,
    borrow: books.filter((book) => hasAccess(book, "borrow")).length,
    preview: books.filter((book) => hasAccess(book, "preview")).length,
    read: books.filter((book) => hasAccess(book, "read")).length,
    listen: books.filter((book) => hasAccess(book, "listen")).length,
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
  if (status === "stale") return `${source} is showing a recent cached page`;
  if (status === "deferred") return `${source} will retry shortly`;
  if (status === "timeout") return `${source} did not finish this pass`;
  if (status === "rate-limited") return `${source} asked us to pause`;
  return `${source} was unavailable this pass`;
}

function readLocation(): LocationState {
  if (typeof window === "undefined") return { query: "", by: "all", savedOnly: false, region: "GB", workId: "" };
  const params = new URLSearchParams(window.location.search);
  const rawBy = params.get("by");
  const rawRegion = params.get("region") as RightsRegion | null;
  const rawWorkId = params.get("work") ?? "";

  return {
    query: params.get("q")?.trim() ?? "",
    by: rawBy === "q" ? "all" : rawBy && validSearchFields.has(rawBy as SearchBy) ? rawBy as SearchBy : "all",
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
  window.history.pushState({}, "", suffix ? `/?${suffix}` : "/");
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
  const [data, setData] = useState<SearchPayload | null>(() => homePayload("GB"));
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
  const [showMobileSearchOptions, setShowMobileSearchOptions] = useState(false);
  const searchFormRef = useRef<HTMLFormElement>(null);
  const loadMoreController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!showMobileSearchOptions) return;
    function closeSearchOptions(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setShowMobileSearchOptions(false);
        return;
      }
      if (event instanceof PointerEvent && !searchFormRef.current?.contains(event.target as Node)) {
        setShowMobileSearchOptions(false);
      }
    }
    window.addEventListener("pointerdown", closeSearchOptions);
    window.addEventListener("keydown", closeSearchOptions);
    return () => {
      window.removeEventListener("pointerdown", closeSearchOptions);
      window.removeEventListener("keydown", closeSearchOptions);
    };
  }, [showMobileSearchOptions]);

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
    if (!location.query && !location.savedOnly) {
      setData(homePayload(location.region));
      setLoading(false);
      setError("");
      return;
    }
    const requestKey = `${location.region}:${location.by}:${location.query.toLocaleLowerCase()}`;
    const cached = cachedResponse(requestKey);
    if (cached) {
      setData(cached);
      setVisibleCount(RESULTS_BATCH_SIZE);
      setError("");
      if (!cached.partial) {
        setLoading(false);
        return;
      }
    }

    const controller = new AbortController();
    loadMoreController.current?.abort();
    setLoadingMore(false);
    setLoadMoreError("");
    setLoading(true);
    setError("");
    fetch(`/api/search?q=${encodeURIComponent(location.query)}&by=${apiSearchMode(location.by)}&region=${location.region}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Search is temporarily unavailable.");
        return response.json();
      })
      .then((payload: SearchPayload) => {
        rememberResponse(requestKey, payload);
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
      : books.filter((book) => book.access === filter || (book.offers ?? []).some((offer) => offer.access === filter));
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
    setShowMobileSearchOptions(false);
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

    const params = new URLSearchParams({ q: location.query, by: apiSearchMode(location.by), region: location.region, cursor: data.nextCursor });
    fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("More results are temporarily unavailable.");
        return response.json();
      })
      .then((payload: SearchPayload) => {
        setData((current) => {
          if (!current) return payload;
          const next = mergePayload(current, payload);
          rememberResponse(`${location.region}:${location.by}:${location.query.toLocaleLowerCase()}`, next);
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
  const resultLabel = location.query ? `Results for “${location.query}”` : filter === "saved" ? "Saved books" : "Start reading";
  const displayedBooks = visibleBooks.slice(0, visibleCount);
  const canLoadMore = displayedBooks.length < visibleBooks.length || Boolean(data?.nextCursor);
  const sourceIssues = data?.sources
    ? [
        sourceIssue("Project Gutenberg", data.sources.gutenberg),
        sourceIssue("Open Library", data.sources.openLibrary),
        sourceIssue("Wikisource", data.sources.wikisource),
        sourceIssue("DOAB", data.sources.doab),
        sourceIssue("Library of Congress", data.sources.libraryOfCongress),
        sourceIssue("LibriVox", data.sources.librivox),
      ].filter(Boolean)
    : [];

  return (
    <main className={styles.page}>
      <SiteNav active={filter === "saved" ? "saved" : "search"} savedCount={saved.length} onSaved={() => selectFilter("saved")} />

      <header className={styles.searchHeader} id="top">
        <p className={styles.kicker}>OPEN BOOK SEARCH</p>
        <div className={styles.headingRow}>
          <h1>Find an open book.</h1>
        </div>
        <form ref={searchFormRef} className={`search-box ${styles.form}`} onSubmit={search} role="search">
          <span aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor="results-book-search">Search by title, author, or subject</label>
          <input id="results-book-search" name="q" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Book, author or subject…" autoComplete="off" />
          <input type="hidden" name="by" value={draftBy} />
          <input type="hidden" name="region" value={draftRegion} />
          <div className={`${styles.searchOptionsPopover} ${showMobileSearchOptions ? styles.searchOptionsPopoverOpen : ""}`} aria-hidden={!showMobileSearchOptions}>
            <span>Search in</span>
            <div className={styles.optionRows}>
              {SEARCH_FIELD_OPTIONS.map((option) => (
                <button className={draftBy === option.value ? styles.optionSelected : undefined} type="button" aria-pressed={draftBy === option.value} tabIndex={showMobileSearchOptions ? 0 : -1} onClick={() => setDraftBy(option.value)} key={option.value}>{option.label}</button>
              ))}
            </div>
            <span>Rights</span>
            <div className={styles.optionRows}>
              {RIGHTS_OPTIONS.map((option) => (
                <button className={draftRegion === option.value ? styles.optionSelected : undefined} type="button" aria-pressed={draftRegion === option.value} tabIndex={showMobileSearchOptions ? 0 : -1} onClick={() => setDraftRegion(option.value)} key={option.value}>{option.label}</button>
              ))}
            </div>
          </div>
          <button className={styles.optionsToggle} type="button" aria-expanded={showMobileSearchOptions} aria-label={`Search options: ${SEARCH_FIELD_OPTIONS.find((option) => option.value === draftBy)?.label}, ${RIGHTS_OPTIONS.find((option) => option.value === draftRegion)?.label}`} onClick={() => setShowMobileSearchOptions((current) => !current)}>
            <span>{SEARCH_FIELD_OPTIONS.find((option) => option.value === draftBy)?.label}</span><i aria-hidden="true">·</i><span>{draftRegion === "GB" ? "UK" : draftRegion === "US" ? "US" : "Global"}</span>
          </button>
          <button className={styles.submitSearch} type="submit" aria-label="Search" disabled={!draft.trim()}><span className={styles.searchLabel}>Search</span><span className={styles.searchGlyph} aria-hidden="true">↑</span></button>
        </form>
        <p className={styles.heroCopy}>Find, read or download from lawful sources.</p>
        <div className="suggestions">
          <span>Try</span>
          {SEARCH_SUGGESTIONS.map((item) => <a href={`/?q=${encodeURIComponent(item)}`} key={item}>{item}</a>)}
        </div>
        <div className="category-row" aria-label="Browse popular genres and subgenres">
          {SUBJECT_SUGGESTIONS.map((item) => <a href={`/?q=${encodeURIComponent(item)}&by=subject`} key={item}>{item}</a>)}
        </div>
      </header>

      {!location.query && !location.savedOnly ? (
        <>
          <section className="home-catalogue" aria-labelledby="starter-shelf-heading">
            <div className="home-catalogue-heading">
              <div>
                <p className="eyebrow">OPEN SHELF</p>
                <h2 id="starter-shelf-heading">Start reading</h2>
              </div>
              <a href="/lists">All lists <span aria-hidden="true">→</span></a>
            </div>
            <div className="book-grid">
              {FEATURED_BOOKS.map((book) => (
                <BookCard
                  book={book}
                  key={bookKey(book)}
                  saved={saved.includes(savedKey(book)) || saved.includes(book.id)}
                  onToggleSaved={() => toggleSaved(book)}
                />
              ))}
            </div>
          </section>

          <nav className="home-tools" aria-label="LibreLeaf tools">
            <a href="/send"><strong>Send a file</strong><span>EPUB, PDF or MOBI</span><b aria-hidden="true">→</b></a>
            <a href="/brief"><strong>News to EPUB</strong><span>Combine reviewed RSS feeds</span><b aria-hidden="true">→</b></a>
            <a href="/guides"><strong>Guides</strong><span>Phones and e-readers</span><b aria-hidden="true">→</b></a>
            <a href="/developers"><strong>API + MCP</strong><span>Build with LibreLeaf</span><b aria-hidden="true">→</b></a>
          </nav>

          <section className="browse-links" aria-labelledby="browse-heading">
            <div>
              <p className="eyebrow">BROWSE</p>
              <h2 id="browse-heading">Browse</h2>
            </div>
            <nav aria-label="Book lists">
              <a href="/lists">Curated topics <span aria-hidden="true">→</span></a>
              <a href="/lists">Popular downloads <span aria-hidden="true">→</span></a>
              <a href="/lists">New open editions <span aria-hidden="true">→</span></a>
            </nav>
          </section>

          <footer>
            <a className="brand" href="#top"><span>libre</span>leaf</a>
            <p>Open-source book search.</p>
            <p>Project Gutenberg, Open Library, Wikisource, DOAB, the Library of Congress and LibriVox.</p>
          </footer>
        </>
      ) : (
      <section className={`results-section ${styles.results}`} aria-live="polite" aria-busy={loading || loadingMore}>
        <div className={`results-heading ${styles.meta}`}>
          <div>
            <p className="eyebrow">CATALOGUE</p>
            <h2>{resultLabel}</h2>
          </div>
          {data ? <p className="result-count">Showing {displayedBooks.length} · {visibleBooks.length}{visibleBooks.length !== data.books.length ? ` match filters · ${data.books.length}` : ""} loaded{data.nextCursor ? " · more available" : ""}</p> : null}
        </div>
        {loading && data ? <p className={styles.working} role="status">Updating results…</p> : null}
        {sourceIssues.length ? <p className={styles.sourceNotice} role="status">Source note: {sourceIssues.join("; ")}. Incomplete sources retry when you load more.</p> : null}
        {data?.rightsContext ? <p className={styles.sourceNotice}>Rights context: {data.rightsContext.label}. {data.rightsContext.note}</p> : null}

        <div className="filter-row" aria-label="Filter search results">
          <button className={filter === "all" ? "active" : ""} onClick={() => selectFilter("all")}>All <span>{data?.counts.total ?? 0}</span></button>
          <button className={filter === "download" ? "active" : ""} onClick={() => selectFilter("download")}>Free downloads <span>{data?.counts.download ?? 0}</span></button>
          <button className={filter === "borrow" ? "active" : ""} onClick={() => selectFilter("borrow")}>Borrow <span>{data?.counts.borrow ?? 0}</span></button>
          <button className={filter === "preview" ? "active" : ""} onClick={() => selectFilter("preview")}>Preview <span>{data?.counts.preview ?? 0}</span></button>
          <button className={filter === "read" ? "active" : ""} onClick={() => selectFilter("read")}>Read online <span>{data?.counts.read ?? 0}</span></button>
          <button className={filter === "listen" ? "active" : ""} onClick={() => selectFilter("listen")}>Listen <span>{data?.counts.listen ?? 0}</span></button>
          <button className={filter === "saved" ? "active" : ""} onClick={() => selectFilter("saved")}>Saved <span>{saved.length}</span></button>
        </div>

        <div className="result-tools">
          <label>Source<select value={source} onChange={(event) => { setSource(event.target.value as typeof source); setVisibleCount(RESULTS_BATCH_SIZE); }}><option value="all">All catalogues</option><option value="Project Gutenberg">Project Gutenberg</option><option value="Open Library">Open Library</option><option value="Wikisource">Wikisource</option><option value="DOAB">DOAB</option><option value="Library of Congress">Library of Congress</option><option value="LibriVox">LibriVox</option></select></label>
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
      )}
    </main>
  );
}
