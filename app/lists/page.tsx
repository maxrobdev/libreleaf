import type { Metadata } from "next";
import ListsPage from "../../components/ListsPage";
import { SiteNav } from "../components/SiteNav";

export const metadata: Metadata = {
  title: "Free book lists",
  description: "Browse trending public-domain books, direct free downloads and Open Library titles.",
};

export default function BookListsPage() {
  return <><SiteNav active="lists" /><ListsPage /></>;
}
