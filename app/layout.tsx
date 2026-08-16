import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { getSiteUrl } from "./seo";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const sans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = await getSiteUrl();
  const title = "LibreLeaf | Free Public-Domain & Open Library Books UK";
  const description =
    "Search free public-domain books and borrowable Open Library editions with LibreLeaf, a mobile-friendly book finder for UK readers.";

  return {
    metadataBase: siteUrl,
    title: {
      default: title,
      template: "%s | LibreLeaf",
    },
    description,
    applicationName: "LibreLeaf",
    keywords: [
      "free books UK",
      "public domain books",
      "free classic ebooks",
      "Project Gutenberg search",
      "Open Library books",
      "free EPUB books",
      "mobile book search",
    ],
    creator: "LibreLeaf",
    publisher: "LibreLeaf",
    category: "Books and literature",
    alternates: {
      canonical: siteUrl,
      languages: {
        "en-GB": siteUrl,
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: "en_GB",
      url: siteUrl,
      siteName: "LibreLeaf",
      title,
      description,
      images: [
        {
          url: new URL("/og.png", siteUrl),
          width: 1731,
          height: 909,
          alt: "LibreLeaf free and open book search",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL("/og.png", siteUrl)],
    },
    manifest: "/manifest.webmanifest",
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const siteUrl = await getSiteUrl();
  const websiteId = new URL("/#website", siteUrl).href;
  const organisationId = new URL("/#organisation", siteUrl).href;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: siteUrl.href,
        name: "LibreLeaf",
        alternateName: "LibreLeaf Book Finder",
        description:
          "A mobile-friendly search tool for public-domain books and borrowable Open Library editions.",
        inLanguage: "en-GB",
        publisher: { "@id": organisationId },
      },
      {
        "@type": "Organization",
        "@id": organisationId,
        name: "LibreLeaf",
        url: siteUrl.href,
      },
      {
        "@type": "WebApplication",
        "@id": new URL("/#webapp", siteUrl).href,
        name: "LibreLeaf",
        url: siteUrl.href,
        description:
          "Find public-domain ebooks and borrowable Open Library editions from a phone, tablet or computer.",
        applicationCategory: "EducationalApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires a modern web browser with JavaScript enabled.",
        inLanguage: "en-GB",
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "GBP",
        },
        audience: {
          "@type": "Audience",
          geographicArea: {
            "@type": "Country",
            name: "United Kingdom",
          },
        },
      },
    ],
  };

  return (
    <html lang="en-GB">
      <body className={`${display.variable} ${sans.variable}`}>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
      </body>
    </html>
  );
}
