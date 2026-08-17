"use client";

import { useEffect, useState } from "react";
import { FEATURED_BOOKS } from "../lib/featured-books";
import { BookCard, type Book } from "./BookCard";

const SAVED_KEY = "libreleaf-saved";

function bookKey(book: Book) {
  return book.canonicalId ?? book.id;
}

export function HomeShelf() {
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "[]");
      if (Array.isArray(value)) setSaved(value.filter((item): item is string => typeof item === "string"));
    } catch {
      setSaved([]);
    }
  }, []);

  function toggleSaved(book: Book) {
    const key = bookKey(book);
    setSaved((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="book-grid">
      {FEATURED_BOOKS.map((book) => (
        <BookCard
          book={book}
          key={bookKey(book)}
          saved={saved.includes(bookKey(book)) || saved.includes(book.id)}
          onToggleSaved={() => toggleSaved(book)}
        />
      ))}
    </div>
  );
}
