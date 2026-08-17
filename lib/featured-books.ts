import type { AccessOffer, Book, SourceRecord } from "../components/BookCard";
import { canonicalWorkUrl, stableWorkId } from "./work-identity";

const GUTENBERG_RIGHTS = {
  status: "source-assessed-public-domain" as const,
  jurisdiction: "US",
  note: "Project Gutenberg marks this edition as public domain in the United States. Copyright status may differ elsewhere.",
  applicability: "source-jurisdiction-only" as const,
};

type FeaturedSeed = {
  id: number;
  title: string;
  author: string;
  year?: number;
};

function featuredBook(seed: FeaturedSeed): Book {
  const detailsUrl = `https://www.gutenberg.org/ebooks/${seed.id}`;
  const offers: AccessOffer[] = [
    {
      label: "Download EPUB",
      format: "EPUB",
      url: `${detailsUrl}.epub3.images`,
      source: "Project Gutenberg",
      access: "download",
      rights: GUTENBERG_RIGHTS,
    },
    {
      label: "Read online",
      format: "HTML",
      url: `${detailsUrl}.html.images`,
      source: "Project Gutenberg",
      access: "read",
      rights: GUTENBERG_RIGHTS,
    },
  ];
  const sourceRecords: SourceRecord[] = [{
    source: "Project Gutenberg",
    recordId: String(seed.id),
    detailsUrl,
    offers,
  }];
  const base: Book = {
    id: `gutenberg-${seed.id}`,
    title: seed.title,
    authors: [seed.author],
    year: seed.year,
    cover: `https://www.gutenberg.org/cache/epub/${seed.id}/pg${seed.id}.cover.medium.jpg`,
    source: "Project Gutenberg",
    access: "download",
    formats: offers.map((offer) => ({ label: offer.format ?? offer.label, url: offer.url })),
    detailsUrl,
    sourceRecords,
    offers,
    why: ["Included in LibreLeaf's versioned starter shelf."],
    clusterConfidence: "exact",
  };
  const canonicalId = stableWorkId(base);
  return { ...base, canonicalId, canonicalUrl: canonicalWorkUrl(base, canonicalId) };
}

export const FEATURED_SHELF_VERSION = "2026-08-16";

export const FEATURED_BOOKS = [
  { id: 1342, title: "Pride and Prejudice", author: "Jane Austen", year: 1813 },
  { id: 84, title: "Frankenstein", author: "Mary Wollstonecraft Shelley", year: 1818 },
  { id: 1661, title: "The Adventures of Sherlock Holmes", author: "Arthur Conan Doyle", year: 1892 },
  { id: 11, title: "Alice's Adventures in Wonderland", author: "Lewis Carroll", year: 1865 },
  { id: 2701, title: "Moby-Dick; or, The Whale", author: "Herman Melville", year: 1851 },
  { id: 23, title: "Narrative of the Life of Frederick Douglass", author: "Frederick Douglass", year: 1845 },
  { id: 1228, title: "On the Origin of Species", author: "Charles Darwin", year: 1859 },
  { id: 2680, title: "Meditations", author: "Marcus Aurelius" },
  { id: 132, title: "The Art of War", author: "Sun Tzu" },
  { id: 205, title: "Walden", author: "Henry David Thoreau", year: 1854 },
].map(featuredBook);
