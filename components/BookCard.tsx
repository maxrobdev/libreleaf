"use client";

import { useState } from "react";
import styles from "./SearchResultsPage.module.css";

export type FormatLink = {
  label: string;
  url: string;
};

export type CatalogueSource = "Project Gutenberg" | "Open Library" | "Wikisource" | "DOAB";
export type AccessType = "download" | "borrow" | "preview" | "read" | "listen";

export type AccessOffer = {
  label: string;
  format?: string;
  url: string;
  source: CatalogueSource;
  access: AccessType;
  language?: string;
  rights?: {
    status: "source-assessed-public-domain" | "open-licence" | "source-policy-free";
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
};

export type SearchPayload = {
  query: string;
  books: Book[];
  counts: { total: number; download: number; borrow: number; preview: number; read?: number; listen?: number };
  nextCursor?: string | null;
  upstreamTotals?: {
    gutenberg: number | null;
    openLibrary: number | null;
    wikisource?: number | null;
    doab?: number | null;
  };
  sources?: {
    gutenberg: "ok" | "unavailable" | "timeout" | "rate-limited" | "exhausted";
    openLibrary: "ok" | "unavailable" | "timeout" | "rate-limited" | "exhausted";
    wikisource?: "ok" | "unavailable" | "timeout" | "rate-limited" | "exhausted";
    doab?: "ok" | "unavailable" | "timeout" | "rate-limited" | "exhausted";
  };
  rightsContext?: { region: "GB" | "US" | "GLOBAL"; label: string; note: string };
};

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
    add({ label: `Download ${format.label}`, url: format.url, source: catalogueSourceFor(book.source), access: "download" }, book.source, "download");
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
};

export function BookCard({ book, saved, onToggleSaved }: BookCardProps) {
  const routes = routesForBook(book);
  const primary = routes[0];
  const sourceRecords = sourceRecordsForBook(book);
  const why = book.why?.join(" · ");
  const hasGutenbergRecord = sourceRecords.some((record) => record.source === "Project Gutenberg") || book.source === "Project Gutenberg";
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <article className="book-card">
      <div className={`book-cover ${panelOpen ? "panel-open" : ""}`}>
        <button className="cover-trigger" onClick={() => setPanelOpen(true)} aria-expanded={panelOpen} aria-label={`Show ways to get ${book.title}`}>
          {book.cover ? <img src={book.cover} alt={`Cover of ${book.title}`} loading="lazy" /> : coverFallback(book.title)}
          <span className={`access-badge ${book.access}`}>
            {book.source === "Project Gutenberg" && book.access === "download" ? "Gutenberg file" : book.access === "download" ? "Download" : book.access === "borrow" ? "Borrow" : book.access === "listen" ? "Listen" : book.access === "read" ? "Read" : "Preview"}
          </span>
          <span className="cover-hint">View options</span>
        </button>
        <button className={`save-button ${saved ? "saved" : ""}`} onClick={onToggleSaved} aria-label={`${saved ? "Remove" : "Save"} ${book.title}`} title={saved ? "Remove from saved books" : "Save book"}>{saved ? "♥" : "♡"}</button>
        {panelOpen ? (
          <div className="cover-panel" aria-label={`Available options for ${book.title}`}>
            <button className="panel-close" onClick={() => setPanelOpen(false)} aria-label="Close book options">Close ×</button>
            <p className="eyebrow">ACCESS ROUTES</p>
            <h3>{routes.length > 1 ? `${routes.length} routes found` : "Available route"}</h3>
            {why ? <div className={styles.why}><strong>Why this result</strong><span>{why}</span>{book.clusterConfidence ? <small>{confidenceLabel(book.clusterConfidence)}</small> : null}</div> : null}
            <div className="panel-links">
              {routes.map((route) => (
                <a className={styles.route} key={`${book.workKey ?? book.id}-${route.url}`} href={route.url} target="_blank" rel="noreferrer" download={route.access === "download"}>
                  <span>{route.label}<small>{route.source}{route.applicability ? ` · ${route.applicability === "verified" ? "licence/source context verified" : route.applicability === "source-jurisdiction-only" ? "source jurisdiction only; check locally" : "check local rights"}` : ""}{route.note ? ` · ${route.note}` : ""}</small></span>
                  <span>{route.access === "download" ? "↓" : "↗"}</span>
                </a>
              ))}
            </div>
            <div className={styles.provenance}>
              <strong>Source records</strong>
              {sourceRecords.map((record, index) => {
                const label = `${record.source} · ${record.recordId}`;
                return <a href={record.detailsUrl} target="_blank" rel="noreferrer" key={`${record.source}-${record.recordId || index}`}>{label} ↗</a>;
              })}
            </div>
            {hasGutenbergRecord ? <p className={styles.jurisdiction}>Project Gutenberg assesses public-domain status under US law. Check the law where you are.</p> : null}
          </div>
        ) : null}
      </div>
      <div className="book-info">
        <div className="source-line"><span>{book.source}</span>{book.year ? <span>{book.year}</span> : null}</div>
        <h2>{book.title}</h2>
        <p className="author">{book.authors.length ? book.authors.join(", ") : "Unknown author"}</p>
        <div className="card-actions">
          {primary ? (
            <a className={`primary-button ${primary.access === "download" ? "" : "read"}`} href={primary.url} download={primary.access === "download"} target="_blank" rel="noreferrer">
              {primary.label}<span aria-hidden="true">{primary.access === "download" ? "↓" : "↗"}</span>
            </a>
          ) : (
            <a className="primary-button read" href={book.detailsUrl} target="_blank" rel="noreferrer">
              {book.access === "borrow" ? "Borrow book" : "View book"}<span aria-hidden="true">↗</span>
            </a>
          )}
          {(routes.length > 1 || sourceRecords.length > 1 || why) ? <button className="format-button" onClick={() => setPanelOpen(true)}>Details</button> : null}
        </div>
      </div>
    </article>
  );
}
