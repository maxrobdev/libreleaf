"use client";

import { useEffect, useState } from "react";
import { BookCard, type Book, type SearchPayload } from "../app/page";

export default function ListsPage() {
  const [data, setData] = useState<SearchPayload | null>(null);
  const [saved, setSaved] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("libreleaf-saved") ?? "[]"); } catch { return []; }
  });
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/search?q=&by=all")
      .then((response) => {
        if (!response.ok) throw new Error("Lists are temporarily unavailable.");
        return response.json();
      })
      .then((payload: SearchPayload) => setData(payload))
      .catch((reason: Error) => setError(reason.message));
  }, []);

  function toggleSaved(id: string) {
    setSaved((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem("libreleaf-saved", JSON.stringify(next));
      return next;
    });
  }

  function shelf(title: string, note: string, index: string, books: Book[]) {
    return (
      <section>
        <div className="shelf-heading"><div><span>{index}</span><h2>{title}</h2></div><p>{note}</p></div>
        <div className="book-grid shelf-grid">{books.slice(0, 12).map((book) => <BookCard key={`${title}-${book.id}`} book={book} saved={saved.includes(book.id)} onToggleSaved={() => toggleSaved(book.id)} />)}</div>
      </section>
    );
  }

  return (
    <main className="lists-page">
      <header className="subpage-hero"><p className="eyebrow">CURATED FROM OPEN CATALOGUES</p><h1>Book lists</h1><p>Popular titles, direct downloads, and books available through Open Library.</p></header>
      {error ? <div className="status-card"><strong>Could not load lists.</strong><p>{error}</p></div> : null}
      {!data && !error ? <div className="status-card"><strong>Loading lists…</strong></div> : null}
      {data ? <div className="home-shelves">{shelf("Trending", "Popular open-catalogue titles", "01", data.books)}{shelf("Free to keep", "Direct public-domain downloads", "02", data.books.filter((book) => book.access === "download"))}{shelf("Borrow or preview", "Available through Open Library", "03", data.books.filter((book) => book.access !== "download"))}</div> : null}
    </main>
  );
}
