import type { Metadata } from "next";
import { Developers } from "../../components/Developers";
import { SiteNav } from "../components/SiteNav";

export const metadata: Metadata = {
  title: "Developers",
  description: "LibreLeaf's open, read-only resolver API and MCP endpoint for lawful book access routes, canonical works and source provenance.",
  alternates: { canonical: "/developers" },
};

export default function DevelopersPage() {
  return <><SiteNav active="developers" /><Developers /></>;
}
