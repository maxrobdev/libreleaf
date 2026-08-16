"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { SiteNav } from "./components/SiteNav";

type FormatLink = {
  label: string;
  url: string;
};

export type Book = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  cover?: string;
  source: "Project Gutenberg" | "Open Library";
  access: "download" | "borrow" | "preview";
  formats: FormatLink[];
  detailsUrl: string;
};

export type SearchPayload = {
  query: string;
  books: Book[];
  counts: { total: number; download: number; borrow: number; preview: number };
};

const suggestions = ["Jane Austen", "Frankenstein", "Sherlock Holmes", "Virginia Woolf"];

function coverFallback(title: string) {
  const palette = ["clay", "sage", "ink", "ochre"];
  const tone = palette[title.length % palette.length];
  return <div className={`cover-fallback ${tone}`} aria-hidden="true"><span>{title.slice(0, 1)}</span></div>;
}

export function BookCard({ book, saved, onToggleSaved }: { book: Book; saved: boolean; onToggleSaved: () => void }) {
  const primary = book.formats[0];
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <article className="book-card">
      <div className={`book-cover ${panelOpen ? "panel-open" : ""}`}>
        <button className="cover-trigger" onClick={() => setPanelOpen(true)} aria-expanded={panelOpen} aria-label={`Show ways to get ${book.title}`}>
          {book.cover ? <img src={book.cover} alt={`Cover of ${book.title}`} loading="lazy" /> : coverFallback(book.title)}
          <span className={`access-badge ${book.access}`}>
            {book.access === "download" ? "Free download" : book.access === "borrow" ? "Borrow" : "Preview"}
          </span>
          <span className="cover-hint">View options</span>
        </button>
        <button className={`save-button ${saved ? "saved" : ""}`} onClick={onToggleSaved} aria-label={`${saved ? "Remove" : "Save"} ${book.title}`} title={saved ? "Remove from saved books" : "Save book"}>{saved ? "♥" : "♡"}</button>
        {panelOpen ? (
          <div className="cover-panel" aria-label={`Available options for ${book.title}`}>
            <button className="panel-close" onClick={() => setPanelOpen(false)} aria-label="Close book options">Close ×</button>
            <p className="eyebrow">GET THIS BOOK</p>
            <h3>{book.formats.length ? "Choose a free format" : book.access === "borrow" ? "Borrow from the library" : "Open the book page"}</h3>
            <div className="panel-links">
              {book.formats.map((item) => <a key={`${book.id}-${item.label}`} href={item.url} target="_blank" rel="noreferrer" download>Download {item.label}<span>↓</span></a>)}
              {!book.formats.length ? <a href={book.detailsUrl} target="_blank" rel="noreferrer">{book.access === "borrow" ? "Borrow this book" : "View preview"}<span>↗</span></a> : null}
            </div>
            <a className="source-page" href={book.detailsUrl} target="_blank" rel="noreferrer">View the source record ↗</a>
          </div>
        ) : null}
      </div>
      <div className="book-info">
        <div className="source-line"><span>{book.source}</span>{book.year ? <span>{book.year}</span> : null}</div>
        <h2>{book.title}</h2>
        <p className="author">{book.authors.length ? book.authors.join(", ") : "Unknown author"}</p>
        <div className="card-actions">
          {primary ? (
            <a className="primary-button" href={primary.url} download target="_blank" rel="noreferrer">
              Download {primary.label}<span aria-hidden="true">↓</span>
            </a>
          ) : (
            <a className="primary-button read" href={book.detailsUrl} target="_blank" rel="noreferrer">
              {book.access === "borrow" ? "Borrow book" : "View book"}<span aria-hidden="true">↗</span>
            </a>
          )}
          {book.formats.length > 1 ? <button className="format-button" onClick={() => setPanelOpen(true)}>All formats</button> : null}
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchBy, setSearchBy] = useState<"all" | "title" | "author" | "subject">("all");
  const [data, setData] = useState<SearchPayload | null>(null);
  const [filter, setFilter] = useState<"all" | "download" | "borrow" | "preview" | "saved">(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "saved" ? "saved" : "all");
  const [source, setSource] = useState<"all" | Book["source"]>("all");
  const [format, setFormat] = useState<"all" | "EPUB" | "MOBI" | "Plain text">("all");
  const [sort, setSort] = useState<"relevance" | "title" | "oldest" | "newest">("relevance");
  const [saved, setSaved] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("libreleaf-saved") ?? "[]"); } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/search?q=${encodeURIComponent(submittedQuery)}&by=${searchBy}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Search is temporarily unavailable.");
        return response.json();
      })
      .then((payload: SearchPayload) => setData(payload))
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [submittedQuery, searchBy]);

  const visibleBooks = useMemo(() => {
    if (!data) return [];
    let books = [...data.books];
    if (filter !== "all") books = filter === "saved" ? books.filter((book) => saved.includes(book.id)) : books.filter((book) => book.access === filter);
    if (source !== "all") books = books.filter((book) => book.source === source);
    if (format !== "all") books = books.filter((book) => book.formats.some((item) => item.label === format));
    if (sort === "title") books.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "oldest") books.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    if (sort === "newest") books.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return books;
  }, [data, filter, source, format, sort, saved]);

  function search(event: FormEvent) {
    event.preventDefault();
    const next = query.trim();
    if (next) setSubmittedQuery(next);
  }

  function toggleSaved(id: string) {
    setSaved((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem("libreleaf-saved", JSON.stringify(next));
      return next;
    });
  }

  return (
    <main>
      <SiteNav active={filter === "saved" ? "saved" : "home"} savedCount={saved.length} onSaved={() => { setFilter("saved"); document.querySelector(".results-section")?.scrollIntoView(); }} />

      <section className="hero" id="top">
        <p className="eyebrow">FREE &amp; OPEN BOOK SEARCH</p>
        <h1>Search open books.<br /><em>Download or borrow.</em></h1>
        <form className="search-box" onSubmit={search}>
          <span aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor="search-by">Search field</label>
          <select id="search-by" value={searchBy} onChange={(event) => setSearchBy(event.target.value as typeof searchBy)}>
            <option value="all">Anywhere</option><option value="title">Title</option><option value="author">Author</option><option value="subject">Subject</option>
          </select>
          <label className="sr-only" htmlFor="book-search">Search by title, author, or subject</label>
          <input id="book-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search by ${searchBy === "all" ? "title, author, or subject" : searchBy}…`} autoComplete="off" />
          <button type="submit">Search</button>
        </form>
        <p className="hero-copy">Search open catalogues. Download public-domain editions, or find a clear route to borrow.</p>
        <div className="suggestions"><span>Try</span>{suggestions.map((item) => <button key={item} onClick={() => { setQuery(item); setSearchBy("all"); setSubmittedQuery(item); }}>{item}</button>)}</div>
        <div className="category-row" aria-label="Browse popular genres and subgenres">{["Gothic fiction", "Detective fiction", "Romantic poetry", "Victorian literature", "Natural history", "Philosophical essays"].map((item) => <button key={item} onClick={() => { setQuery(item); setSearchBy("subject"); setSubmittedQuery(item); }}>{item}</button>)}</div>
      </section>

      <section className="results-section" id="catalogue" aria-live="polite">
        <div className="results-heading">
          <div>
            <p className="eyebrow">CATALOGUE RESULTS</p>
            <h2>{loading ? "Searching the shelves…" : submittedQuery ? `Books for “${submittedQuery}”` : "Most-loved open books"}</h2>
          </div>
          {data ? <p className="result-count">{data.counts.total} matches gathered</p> : null}
        </div>

        <div className="filter-row" aria-label="Filter search results">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All <span>{data?.counts.total ?? 0}</span></button>
          <button className={filter === "download" ? "active" : ""} onClick={() => setFilter("download")}>Free downloads <span>{data?.counts.download ?? 0}</span></button>
          <button className={filter === "borrow" ? "active" : ""} onClick={() => setFilter("borrow")}>Borrow <span>{data?.counts.borrow ?? 0}</span></button>
          <button className={filter === "preview" ? "active" : ""} onClick={() => setFilter("preview")}>Preview <span>{data?.counts.preview ?? 0}</span></button>
          <button className={filter === "saved" ? "active" : ""} onClick={() => setFilter("saved")}>Saved <span>{saved.length}</span></button>
        </div>

        <div className="result-tools">
          <label>Source<select value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="all">All catalogues</option><option value="Project Gutenberg">Project Gutenberg</option><option value="Open Library">Open Library</option></select></label>
          <label>Format<select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="all">Every format</option><option value="EPUB">EPUB</option><option value="MOBI">MOBI</option><option value="Plain text">Plain text</option></select></label>
          <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="relevance">Best match</option><option value="title">Title A–Z</option><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
          {(filter !== "all" || source !== "all" || format !== "all" || sort !== "relevance") ? <button onClick={() => { setFilter("all"); setSource("all"); setFormat("all"); setSort("relevance"); }}>Reset filters</button> : null}
        </div>

        {error ? <div className="status-card"><strong>We couldn’t reach the catalogues.</strong><p>{error} Please try again in a moment.</p></div> : null}
        {loading ? <div className="book-grid loading-grid">{Array.from({ length: 8 }).map((_, index) => <div className="loading-card" key={index}><div /><span /><span /></div>)}</div> : null}
        {!loading && !error && visibleBooks.length ? <div className="book-grid">{visibleBooks.map((book) => <BookCard key={book.id} book={book} saved={saved.includes(book.id)} onToggleSaved={() => toggleSaved(book.id)} />)}</div> : null}
        {!loading && !error && !visibleBooks.length ? <div className="status-card"><strong>No books in this section.</strong><p>Try another title, author, subject, or a different access filter.</p></div> : null}
      </section>

      <section className="manifesto" id="about"><p className="eyebrow">PROJECT POSITION</p><h2>Public-domain information should be easy to access.</h2><p>LibreLeaf is open-source infrastructure, not a storefront. It indexes lawful public-domain and library sources. It does not sell books, hide downloads behind redirects, or build reader profiles.</p></section>

      <section className="trust-strip">
        <div><span>01</span><h3>Open by design</h3><p>Direct downloads appear only for editions identified as freely downloadable by their source.</p></div>
        <div><span>02</span><h3>No mystery buttons</h3><p>Every action says whether it downloads a file, opens a preview, or starts a library loan.</p></div>
        <div><span>03</span><h3>Made for readers</h3><p>No account, tracking profile, pop-ups, or bundled download manager. Just books.</p></div>
      </section>

      <footer><a className="brand" href="#top"><span>libre</span>leaf</a><p>Open books, clearly found.</p><p>Catalogue data from Project Gutenberg &amp; Open Library.</p></footer>
    </main>
  );
}
