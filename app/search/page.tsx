import type { Metadata } from "next";
import SearchResultsPage from "../../components/SearchResultsPage";

export const metadata: Metadata = {
  title: "Resolve book access",
  description: "Search a title or author across open catalogues and compare source-labelled download, read, listen, borrow and preview routes.",
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return <SearchResultsPage />;
}
