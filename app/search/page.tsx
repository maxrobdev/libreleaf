import type { Metadata } from "next";
import SearchResultsPage from "../../components/SearchResultsPage";

export const metadata: Metadata = {
  title: "Resolve book access",
  description: "Search a title or author across open catalogues and compare source-labelled download, read, borrow and preview routes.",
  alternates: { canonical: "/search" },
};

export default function SearchPage() {
  return <SearchResultsPage />;
}
