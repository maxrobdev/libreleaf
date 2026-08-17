import type { CatalogueSource } from "./sources/types.ts";

export const PUBLIC_SITE_ORIGIN = "https://libreleaf-books.netlify.app";
export const WORK_ID_PREFIX = "llw1.";
export const MAX_WORK_ID_LENGTH = 1_024;

const catalogueSources = [
  "Project Gutenberg",
  "Open Library",
  "Wikisource",
  "DOAB",
  "Library of Congress",
] as const satisfies readonly CatalogueSource[];

export type WorkIdentity = {
  v: 1;
  t: string;
  a?: string;
  s?: CatalogueSource;
  r?: string;
};

type WorkLike = {
  id: string;
  title: string;
  authors: string[];
  source: string;
  sourceRecords?: Array<{ source: CatalogueSource; recordId: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCatalogueSource(value: unknown): value is CatalogueSource {
  return typeof value === "string" && catalogueSources.some((source) => source === value);
}

function normaliseIdentityText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normaliseIdentityAuthor(value: string) {
  return normaliseIdentityText(value).split(" ").filter(Boolean).sort().join(" ");
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function workIdentity(book: WorkLike): WorkIdentity {
  const title = normaliseIdentityText(book.title) || book.title.trim().slice(0, 300);
  const author = normaliseIdentityAuthor(book.authors[0] ?? "");
  if (author) return { v: 1, t: title, a: author };

  const record = book.sourceRecords?.[0];
  if (record) return { v: 1, t: title, s: record.source, r: record.recordId };
  const fallbackSource = catalogueSources.find((source) => book.source.includes(source)) ?? "Open Library";
  return { v: 1, t: title, s: fallbackSource, r: book.id };
}

export function stableWorkId(book: WorkLike) {
  return `${WORK_ID_PREFIX}${base64UrlEncode(JSON.stringify(workIdentity(book)))}`;
}

export function decodeStableWorkId(value: string): WorkIdentity {
  if (!value.startsWith(WORK_ID_PREFIX) || value.length > MAX_WORK_ID_LENGTH || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error("Invalid LibreLeaf work ID.");
  }
  try {
    const decoded: unknown = JSON.parse(base64UrlDecode(value.slice(WORK_ID_PREFIX.length)));
    if (!isRecord(decoded) || decoded.v !== 1 || typeof decoded.t !== "string" || !decoded.t || decoded.t.length > 300) throw new Error();
    const author = decoded.a;
    const source = decoded.s;
    const recordId = decoded.r;
    if (author !== undefined && (typeof author !== "string" || !author || author.length > 240)) throw new Error();
    if (source !== undefined && !isCatalogueSource(source)) throw new Error();
    if (recordId !== undefined && (typeof recordId !== "string" || !recordId || recordId.length > 300)) throw new Error();
    if (!author && !(source && recordId)) throw new Error();
    const identity: WorkIdentity = { v: 1, t: decoded.t };
    if (typeof author === "string") identity.a = author;
    if (isCatalogueSource(source)) identity.s = source;
    if (typeof recordId === "string") identity.r = recordId;
    return identity;
  } catch {
    throw new Error("Invalid LibreLeaf work ID.");
  }
}

export function workIdentityMatches(book: WorkLike, expected: WorkIdentity) {
  const actual = workIdentity(book);
  return actual.v === expected.v
    && actual.t === expected.t
    && actual.a === expected.a
    && actual.s === expected.s
    && actual.r === expected.r;
}

export function canonicalWorkUrl(book: WorkLike, id = stableWorkId(book), origin = PUBLIC_SITE_ORIGIN) {
  const url = new URL("/", origin);
  url.searchParams.set("q", book.title);
  url.searchParams.set("by", "title");
  url.searchParams.set("work", id);
  return url.toString();
}
