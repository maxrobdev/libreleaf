import type { Metadata } from "next";
import SearchResultsPage from "../../components/SearchResultsPage";

export const metadata: Metadata = {
  title: "Resolve book access",
  description: "Search a title or author and compare source-labelled download, borrow and preview routes across Project Gutenberg and Open Library.",
  alternates: { canonical: "/search" },
};

export default function SearchPage() {
  return <SearchResultsPage />;
}
