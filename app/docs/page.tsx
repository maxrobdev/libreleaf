import type { Metadata } from "next";
import { SiteNav } from "../components/SiteNav";
import { TechnicalDocsHub } from "../../components/TechnicalDocs";

export const metadata: Metadata = {
  title: "Technical Documentation",
  description: "Technical reference for the LibreLeaf resolver API, MCP server, source and rights model, open index, LibreSend and Briefleaf.",
  alternates: { canonical: "/docs" },
};

export default function DocumentationPage() {
  return <><SiteNav active="docs" /><TechnicalDocsHub /></>;
}
