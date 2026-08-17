import type { Metadata } from "next";
import { LeafSend } from "../../components/LeafSend";
import { getSiteUrl } from "../seo";

export const metadata: Metadata = {
  title: "LeafSend — Local EPUB, PDF and MOBI handoff",
  description: "Share an EPUB, PDF or MOBI through your device without uploading it to LibreLeaf, with official Kindle and Kobo import routes.",
  alternates: { canonical: "/send" },
  openGraph: {
    title: "LeafSend — Local ebook handoff",
    description: "Use the system share sheet or a local save fallback. Files are not uploaded to LibreLeaf.",
    url: "/send",
  },
};

export default async function SendPage() {
  const siteUrl = await getSiteUrl();
  const url = new URL("/send", siteUrl).href;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "LeafSend",
    url,
    description: "A local-first browser tool for handing EPUB, PDF and MOBI files to the operating-system share sheet or saving a local copy.",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    browserRequirements: "A modern browser; file sharing depends on browser and operating-system support.",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
  };

  return (
    <>
      <LeafSend />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
