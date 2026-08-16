import type { Metadata } from "next";
import ListsPage from "../../components/ListsPage";
import { SiteNav } from "../components/SiteNav";

export const metadata: Metadata = {
  title: "Live open-book lists",
  description: "Auto-updating lists from Project Gutenberg, Standard Ebooks and Open Library, with source provenance and jurisdiction-aware access labels.",
};

export default function BookListsPage() {
  return <><SiteNav active="lists" /><ListsPage /></>;
}
