import type { Metadata } from "next";
import { LibreSend } from "../../components/LibreSend";
import { getSiteUrl } from "../seo";

export const metadata: Metadata = {
  title: "LibreSend — Local and encrypted ebook handoff",
  description: "Share an EPUB, PDF or MOBI locally, or connect an optional self-hosted encrypted one-use relay.",
  alternates: { canonical: "/send" },
  openGraph: {
    title: "LibreSend — Local and encrypted ebook handoff",
    description: "Use local share/save or an explicitly configured self-hosted encrypted relay.",
    url: "/send",
  },
};

export default async function SendPage() {
  const siteUrl = await getSiteUrl();
  const url = new URL("/send", siteUrl).href;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "LibreSend",
    url,
    description: "A local-first browser framework for sharing EPUB, PDF and MOBI files locally or through an optional self-hosted encrypted relay.",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    browserRequirements: "A modern browser; file sharing depends on browser and operating-system support.",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
  };

  return (
    <>
      <LibreSend relayUrl={process.env.NEXT_PUBLIC_LIBRESEND_RELAY_URL} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
