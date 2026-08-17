import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalWorkUrl,
  decodeStableWorkId,
  stableWorkId,
  workIdentityMatches,
} from "../lib/work-identity.ts";

test("keeps canonical work IDs stable across author ordering and source availability", () => {
  const gutenberg = {
    id: "gutenberg-1342",
    title: "Pride & Prejudice",
    authors: ["Austen, Jane"],
    source: "Project Gutenberg",
    sourceRecords: [{ source: "Project Gutenberg" as const, recordId: "1342" }],
  };
  const openLibrary = {
    id: "openlibrary-/works/OL66554W",
    title: "Pride and Prejudice",
    authors: ["Jane Austen"],
    source: "Open Library",
    sourceRecords: [{ source: "Open Library" as const, recordId: "/works/OL66554W" }],
  };

  assert.equal(stableWorkId(gutenberg), stableWorkId(openLibrary));
  assert.equal(workIdentityMatches(openLibrary, decodeStableWorkId(stableWorkId(gutenberg))), true);
});

test("uses source record identity when author metadata is absent", () => {
  const wikisource = {
    id: "wikisource-en:942",
    title: "Pride and Prejudice (1817)",
    authors: [],
    source: "Wikisource",
    sourceRecords: [{ source: "Wikisource" as const, recordId: "en:942" }],
  };
  const otherRecord = {
    ...wikisource,
    id: "wikisource-en:943",
    sourceRecords: [{ source: "Wikisource" as const, recordId: "en:943" }],
  };

  assert.notEqual(stableWorkId(wikisource), stableWorkId(otherRecord));
  assert.deepEqual(decodeStableWorkId(stableWorkId(wikisource)), {
    v: 1,
    t: "pride and prejudice 1817",
    s: "Wikisource",
    r: "en:942",
  });
});

test("creates a citation URL that selects the exact canonical work", () => {
  const book = {
    id: "doab-1",
    title: "Écriture ouverte",
    authors: ["Zoë Martin"],
    source: "DOAB",
    sourceRecords: [{ source: "DOAB" as const, recordId: "1" }],
  };
  const id = stableWorkId(book);
  const url = new URL(canonicalWorkUrl(book, id));

  assert.equal(url.origin, "https://libreleaf-books.netlify.app");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("work"), id);
  assert.equal(url.searchParams.get("q"), book.title);
});
