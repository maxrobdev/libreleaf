import type { Metadata } from "next";
import { GuidesHub } from "../../components/Guides";
import { SiteNav } from "../components/SiteNav";

export const metadata: Metadata = {
  title: "Ebook and Open Reading Guides",
  description: "Practical guides for reading lawful free books on phones and e-readers, checking rights, and using the LibreLeaf API and MCP server.",
  alternates: { canonical: "/guides" },
};

export default function GuidesPage() {
  return <><SiteNav active="guides" /><GuidesHub /></>;
}
