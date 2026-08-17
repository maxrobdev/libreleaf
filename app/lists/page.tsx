import type { Metadata } from "next";
import ListsPage from "../../components/ListsPage";
import { SiteNav } from "../components/SiteNav";

export const metadata: Metadata = {
  title: "Curated open-book lists",
  description: "Browse stable topic lists and optional live catalogue feeds, then resolve each title to source-labelled access routes.",
};

export default function BookListsPage() {
  return <><SiteNav active="lists" /><ListsPage /></>;
}
