import type { Metadata } from "next";
import { LibreSend } from "../../components/LibreSend";
import { getSiteUrl } from "../seo";

export const metadata: Metadata = {
  title: "LibreSend — Send EPUB and PDF to phones, Kindle and Kobo",
  description: "Move an EPUB or PDF to iPhone, Android, Kindle or Kobo using local sharing, the first-party LibreSend Local app or an optional encrypted relay.",
  keywords: ["send EPUB to Kindle", "send EPUB to Kobo", "Kobo Wi-Fi transfer", "Kindle browser fallback", "OPDS ebook transfer", "LibreSend Local"],
  alternates: { canonical: "/send" },
  openGraph: {
    title: "LibreSend — Send EPUB and PDF to phones, Kindle and Kobo",
    description: "Device-specific ebook delivery with local sharing, official Kindle and Kobo routes, the LibreSend Local app and an optional encrypted relay.",
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
    description: "A destination-aware tool and first-party local application for moving EPUB, PDF and MOBI files to phones, Kindle and Kobo through local sharing, official services, trusted Wi-Fi or an optional encrypted relay.",
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
