"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LibreSendLink } from "./LibreSendLink";
import styles from "./SearchResultsPage.module.css";

export type FormatLink = {
  label: string;
  url: string;
};

export type CatalogueSource = "Project Gutenberg" | "Open Library" | "Wikisource" | "DOAB" | "Library of Congress";
export type AccessType = "download" | "borrow" | "preview" | "read" | "listen";

export type AccessOffer = {
  label: string;
  format?: string;
  url: string;
  source: CatalogueSource;
  access: AccessType;
  language?: string;
  rights?: {
    status: "source-assessed-public-domain" | "open-licence" | "source-policy-free" | "source-provided-access";
    jurisdiction: string;
    note: string;
    licenceUrl?: string;
    applicability?: "verified" | "source-jurisdiction-only" | "check-local";
  };
};

export type SourceRecord = {
  source: CatalogueSource;
  recordId: string;
  detailsUrl: string;
  workKey?: string;
  language?: string;
  country?: string;
  offers: AccessOffer[];
};

export type Book = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  cover?: string;
  source: string;
  access: AccessType;
  formats: FormatLink[];
  detailsUrl: string;
  workKey?: string;
  language?: string;
  country?: string;
  sourceRecords?: SourceRecord[];
  offers?: AccessOffer[];
  why?: string[];
  clusterConfidence?: "exact" | "probable";
  canonicalId?: string;
  canonicalUrl?: string;
  ranking?: {
    method: "rrf-v1";
    score: number;
    sourceRanks: Array<{ source: CatalogueSource; rank: number }>;
    reasons: string[];
  };
};

export type SearchPayload = {
  query: string;
  books: Book[];
  partial?: boolean;
  counts: { total: number; download: number; borrow: number; preview: number; read?: number; listen?: number };
  nextCursor?: string | null;
  upstreamTotals?: {
    gutenberg: number | null;
    openLibrary: number | null;
    wikisource?: number | null;
    doab?: number | null;
    libraryOfCongress?: number | null;
  };
  sources?: {
    gutenberg: SourceStatus;
    openLibrary: SourceStatus;
    wikisource?: SourceStatus;
    doab?: SourceStatus;
    libraryOfCongress?: SourceStatus;
  };
  sourceHealth?: Record<string, {
    status: SourceStatus;
    durationMs: number;
    attempted: boolean;
    cache: "none" | "stale";
    circuit: "closed" | "open";
  }>;
  searchTiming?: { firstResultsBudgetMs: number; totalMs: number };
  rightsContext?: { region: "GB" | "US" | "GLOBAL"; label: string; note: string };
  ranking?: { method: "rrf-v1"; k: number; note: string };
};

type SourceStatus = "ok" | "stale" | "deferred" | "unavailable" | "timeout" | "rate-limited" | "exhausted";

type EditionAccessLink = {
  kind: "catalogue" | "availability";
  label: string;
  url: string;
  source: "Open Library" | "Internet Archive";
  availability: "not-checked";
};

type ResolvedEdition = {
  key: string;
  title: string;
  publishDate?: string;
  publishYear?: number;
  languages: { code: string; name?: string }[];
  isbn10: string[];
  isbn13: string[];
  publishers: string[];
  physicalFormat?: string;
  numberOfPages?: number;
  accessLinks: EditionAccessLink[];
  rights: { status: "not-assessed"; note: string };
  provenance: {
    source: "Open Library";
    workKey: string;
    editionKey: string;
    recordUrl: string;
    apiRecordUrl: string;
  };
};

type EditionsPayload = {
  workKey: string;
  total: number;
  returned: number;
  partial: boolean;
  limit: number;
  editions: ResolvedEdition[];
  provenance: {
    source: "Open Library";
    workUrl: string;
    editionsApiUrl: string;
    fetchedAt: string;
  };
};

type EditionsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: EditionsPayload };

type DisplayRoute = {
  label: string;
  url: string;
  source: string;
  access: AccessType;
  note?: string;
  applicability?: "verified" | "source-jurisdiction-only" | "check-local";
};

function offerLabel(offer: AccessOffer) {
  if (offer.label) return offer.label;
  if (offer.format) return offer.access === "download" ? `Download ${offer.format}` : offer.format;
  if (offer.access === "borrow") return "Borrow";
  if (offer.access === "preview") return "Preview";
  if (offer.access === "read") return "Read online";
  if (offer.access === "listen") return "Listen";
  return "Open access route";
}

function catalogueSourceFor(value: string): CatalogueSource {
  if (value.includes("Project Gutenberg")) return "Project Gutenberg";
  if (value.includes("Wikisource")) return "Wikisource";
  if (value.includes("DOAB")) return "DOAB";
  if (value.includes("Library of Congress")) return "Library of Congress";
  return "Open Library";
}

function routesForBook(book: Book): DisplayRoute[] {
  const routes: DisplayRoute[] = [];
  const seen = new Set<string>();

  function add(offer: AccessOffer, fallbackSource: string, fallbackAccess: DisplayRoute["access"]) {
    if (!offer.url || seen.has(offer.url)) return;
    seen.add(offer.url);
    routes.push({
      label: offerLabel(offer),
      url: offer.url,
      source: offer.source ?? fallbackSource,
      access: offer.access ?? fallbackAccess,
      note: offer.rights?.note,
      applicability: offer.rights?.applicability,
    });
  }

  for (const offer of book.offers ?? []) add(offer, book.source, book.access);
  for (const record of book.sourceRecords ?? []) {
    for (const offer of record.offers ?? []) add(offer, record.source, book.access);
  }
  for (const format of book.formats) {
    const access = format.label.toLocaleLowerCase().includes("read online") ? "read" : "download";
    add({ label: access === "download" ? `Download ${format.label}` : format.label, url: format.url, source: catalogueSourceFor(book.source), access }, book.source, access);
  }

  if (!routes.length) {
    add({
      label: book.access === "borrow" ? "Borrow this book" : book.access === "preview" ? "View preview" : "Open source record",
      url: book.detailsUrl,
      source: catalogueSourceFor(book.source),
      access: book.access,
    }, book.source, book.access);
  }

  return routes;
}

function representativeRoutes(routes: DisplayRoute[], limit = 3) {
  const firstBySource: DisplayRoute[] = [];
  const remaining: DisplayRoute[] = [];
  const seenSources = new Set<string>();

  for (const route of routes) {
    if (seenSources.has(route.source)) remaining.push(route);
    else {
      seenSources.add(route.source);
      firstBySource.push(route);
    }
  }

  return [...firstBySource, ...remaining].slice(0, limit);
}

function sourceRecordsForBook(book: Book): SourceRecord[] {
  if (book.sourceRecords?.length) return book.sourceRecords;
  const source = catalogueSourceFor(book.source);
  return [{ source, recordId: book.id, detailsUrl: book.detailsUrl, offers: [] }];
}

function confidenceLabel(value: Book["clusterConfidence"]) {
  return value === "exact" ? "Exact metadata match" : value === "probable" ? "Probable work match" : "";
}

function coverFallback(title: string) {
  const palette = ["clay", "sage", "ink", "ochre"];
  const tone = palette[title.length % palette.length];

  return (
    <div className={`cover-fallback ${tone}`} aria-hidden="true">
      <span>{title.slice(0, 1)}</span>
    </div>
  );
}

type BookCardProps = {
  book: Book;
  saved: boolean;
  onToggleSaved: () => void;
  focused?: boolean;
};

export function BookCard({ book, saved, onToggleSaved, focused = false }: BookCardProps) {
  const routes = routesForBook(book);
  const primary = routes[0];
  const downloadRoute = routes.find((route) => route.access === "download");
  const readingRoute = routes.find((route) => route.access !== "download");
  const cardRoutes = [downloadRoute, readingRoute ?? (!downloadRoute ? primary : undefined)]
    .filter((route, index, all): route is DisplayRoute => Boolean(route) && all.indexOf(route) === index)
    .slice(0, 2);
  const sourceRecords = sourceRecordsForBook(book);
  const why = [...(book.ranking?.reasons ?? []), ...(book.why ?? [])]
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .join(" · ");
  const hasGutenbergRecord = sourceRecords.some((record) => record.source === "Project Gutenberg") || book.source === "Project Gutenberg";
  const [panelOpen, setPanelOpen] = useState(focused);
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [editionsState, setEditionsState] = useState<EditionsState>({ status: "idle" });
  const editionsHeadingId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const visibleRoutes = showAllRoutes ? routes : representativeRoutes(routes);

  useEffect(() => {
    if (focused) setPanelOpen(true);
  }, [focused]);

  useEffect(() => {
    if (!panelOpen) return;
    closeButtonRef.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPanelOpen(false);
      setShowAllRoutes(false);
      requestAnimationFrame(() => panelTriggerRef.current?.focus());
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [panelOpen]);

  function openPanel(trigger: HTMLButtonElement) {
    panelTriggerRef.current = trigger;
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setShowAllRoutes(false);
    requestAnimationFrame(() => panelTriggerRef.current?.focus());
  }

  async function loadEditions() {
    if (!book.workKey || editionsState.status === "loading") return;
    setEditionsState({ status: "loading" });
    try {
      const response = await fetch(`/api/editions?workKey=${encodeURIComponent(book.workKey)}`);
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
          ? body.message
          : "Edition records are temporarily unavailable.";
        throw new Error(message);
      }
      if (typeof body !== "object" || body === null || !("editions" in body) || !Array.isArray(body.editions)) {
        throw new Error("Open Library returned an unexpected editions response.");
      }
      setEditionsState({ status: "ready", payload: body as EditionsPayload });
    } catch (error) {
      setEditionsState({
        status: "error",
        message: error instanceof Error ? error.message : "Edition records are temporarily unavailable.",
      });
    }
  }

  return (
    <article className={`book-card ${focused ? styles.focusedWork : ""}`}>
      <div className={`book-cover ${panelOpen ? "panel-open" : ""}`}>
        <button className="cover-trigger" onClick={(event) => openPanel(event.currentTarget)} aria-expanded={panelOpen} aria-label={`Show ways to get ${book.title}`}>
          {book.cover ? <img src={book.cover} alt={`Cover of ${book.title}`} loading="lazy" /> : coverFallback(book.title)}
          <span className={`access-badge ${book.access}`}>
            {book.source === "Project Gutenberg" && book.access === "download" ? "Gutenberg file" : book.access === "download" ? "Download" : book.access === "borrow" ? "Borrow" : book.access === "listen" ? "Listen" : book.access === "read" ? "Read" : "Preview"}
          </span>
          <span className="cover-hint">View options</span>
        </button>
        <button className={`save-button ${saved ? "saved" : ""}`} onClick={onToggleSaved} aria-label={`${saved ? "Remove" : "Save"} ${book.title}`} title={saved ? "Remove from saved books" : "Save book"}>{saved ? "♥" : "♡"}</button>
        {panelOpen ? (
          <div className="cover-panel" role="dialog" aria-modal="false" aria-label={`Available options for ${book.title}`}>
            <button ref={closeButtonRef} className="panel-close" onClick={closePanel} aria-label="Close book options">×</button>
            <h3>Get this book</h3>
            <div className="panel-links">
              {visibleRoutes.map((route, index) => (
                <div className={styles.routeRow} key={`${book.workKey ?? book.id}-${route.url}`}>
                  <a className={`${styles.route} ${index === 0 ? styles.routePrimary : ""}`} href={route.url} target="_blank" rel="noreferrer" download={route.access === "download"}>
                    <span>{route.label}<small>{route.source}{route.applicability ? ` · ${route.applicability === "verified" ? "licence/source context verified" : route.applicability === "source-jurisdiction-only" ? "source jurisdiction only; check locally" : "check local rights"}` : ""}{route.note ? ` · ${route.note}` : ""}</small></span>
                    <span>{route.access === "download" ? "↓" : "↗"}</span>
                  </a>
                  <LibreSendLink className={styles.routeSend} title={`${book.title} — ${route.label}`} url={route.url} />
                </div>
              ))}
            </div>
            {routes.length > 3 ? (
              <button className={styles.routeToggle} type="button" aria-expanded={showAllRoutes} onClick={() => setShowAllRoutes((current) => !current)}>
                {showAllRoutes ? "Show representative routes" : `Show all ${routes.length} routes`}
              </button>
            ) : null}
            <details className={styles.resultDetails}>
              <summary>Source and ranking</summary>
              {why ? <div className={styles.why}><strong>Why this result</strong><span>{why}</span>{book.clusterConfidence ? <small>{confidenceLabel(book.clusterConfidence)}</small> : null}</div> : null}
              <div className={styles.provenance}>
                {sourceRecords.map((record, index) => {
                  const label = `${record.source} · ${record.recordId}`;
                  return <a href={record.detailsUrl} target="_blank" rel="noreferrer" key={`${record.source}-${record.recordId || index}`}>{label} ↗</a>;
                })}
                {book.canonicalUrl ? <a href={book.canonicalUrl}>Permanent work link ↗</a> : null}
              </div>
            </details>
            {book.workKey ? (
              <section className={styles.editions} aria-labelledby={editionsHeadingId} aria-busy={editionsState.status === "loading"}>
                <div className={styles.editionsHeading}>
                  <strong id={editionsHeadingId}>Editions</strong>
                  {editionsState.status === "ready" ? <span>{editionsState.payload.returned} of {editionsState.payload.total}</span> : null}
                </div>
                {editionsState.status === "idle" ? (
                  <>
                    <p>Compare language, date, ISBN and edition-specific access records.</p>
                    <button type="button" onClick={loadEditions}>Load editions</button>
                  </>
                ) : null}
                {editionsState.status === "loading" ? <p className={styles.editionStatus} role="status" aria-live="polite">Loading Open Library editions…</p> : null}
                {editionsState.status === "error" ? (
                  <div className={styles.editionError} role="alert">
                    <span>{editionsState.message}</span>
                    <button type="button" onClick={loadEditions}>Retry editions</button>
                  </div>
                ) : null}
                {editionsState.status === "ready" ? (
                  <>
                    {editionsState.payload.editions.length ? (
                      <ul className={styles.editionList}>
                        {editionsState.payload.editions.map((edition) => {
                          const languages = edition.languages.map((language) => language.name ?? language.code.toUpperCase()).join(", ");
                          const isbn = edition.isbn13[0] ?? edition.isbn10[0];
                          const facts = [
                            edition.publishYear ? String(edition.publishYear) : edition.publishDate,
                            languages,
                            edition.physicalFormat,
                            edition.numberOfPages ? `${edition.numberOfPages} pages` : undefined,
                          ].filter(Boolean).join(" · ");
                          return (
                            <li key={edition.key}>
                              <strong>{edition.title}</strong>
                              {facts ? <span>{facts}</span> : null}
                              {edition.publishers[0] || isbn ? <small>{[edition.publishers[0], isbn ? `ISBN ${isbn}` : undefined].filter(Boolean).join(" · ")}</small> : null}
                              <div className={styles.editionLinks}>
                                {edition.accessLinks.map((link) => (
                                  <a key={`${edition.key}-${link.url}`} href={link.url} target="_blank" rel="noreferrer">
                                    {link.label} <span aria-hidden="true">↗</span><small>{link.source} · availability not checked</small>
                                  </a>
                                ))}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : <p className={styles.editionStatus}>No edition records were returned for this work.</p>}
                    {editionsState.payload.partial ? <p className={styles.editionStatus}>Showing the first {editionsState.payload.returned} of {editionsState.payload.total} catalogue records.</p> : null}
                    <p className={styles.editionRights}>Edition metadata and links do not establish copyright or access rights. Check the edition record and the law where you are.</p>
                  </>
                ) : null}
              </section>
            ) : null}
            {hasGutenbergRecord ? <p className={styles.jurisdiction}>Project Gutenberg assesses public-domain status under US law. Check the law where you are.</p> : null}
          </div>
        ) : null}
      </div>
      <div className="book-info">
        <div className="source-line"><span>{book.source}</span>{book.year ? <span>{book.year}</span> : null}</div>
        <h2><button className="book-title-trigger" onClick={(event) => openPanel(event.currentTarget)} aria-expanded={panelOpen}>{book.title}</button></h2>
        <p className="author">{book.authors.length ? book.authors.join(", ") : "Unknown author"}</p>
        <div className="card-actions">
          {cardRoutes.length ? cardRoutes.map((route) => (
            <a className={`primary-button ${route.access === "download" ? "" : "read"}`} href={route.url} download={route.access === "download"} target="_blank" rel="noreferrer" key={`${route.access}-${route.url}`}>
              {route.access === "download" ? "Download" : route.access === "borrow" ? "Borrow" : route.access === "listen" ? "Listen" : route.access === "preview" ? "Preview" : "Read"}<span aria-hidden="true">{route.access === "download" ? "↓" : "↗"}</span>
            </a>
          )) : (
            <a className="primary-button read" href={book.detailsUrl} target="_blank" rel="noreferrer">
              {book.access === "borrow" ? "Borrow book" : "View book"}<span aria-hidden="true">↗</span>
            </a>
          )}
          {(routes.length > 1 || sourceRecords.length > 1 || why || book.workKey) ? <button className="format-button" onClick={(event) => openPanel(event.currentTarget)}>More</button> : null}
        </div>
      </div>
    </article>
  );
}
