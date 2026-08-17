import type { Metadata } from "next";
import { SiteNav } from "../components/SiteNav";
import { Briefleaf } from "../../components/Briefleaf";

export const metadata: Metadata = {
  title: "Briefleaf RSS to EPUB",
  description: "Preview reviewed official RSS feeds by country and topic, then download a lightweight personal EPUB with source attribution and original links.",
};

export default function BriefleafPage() {
  return <><SiteNav active="brief" /><Briefleaf /></>;
}
