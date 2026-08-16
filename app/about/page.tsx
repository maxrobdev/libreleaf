import type { Metadata } from "next";
import AboutLibreLeaf from "../../components/AboutLibreLeaf";
import { SiteNav } from "../components/SiteNav";

export const metadata: Metadata = {
  title: "About",
  description:
    "About LibreLeaf, the free and open-source tool for finding lawful public-domain downloads and library access.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About LibreLeaf",
    description:
      "Free, open-source book discovery with clear routes to public-domain downloads and library lending.",
    url: "/about",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <>
      <SiteNav active="about" />
      <AboutLibreLeaf />
    </>
  );
}
