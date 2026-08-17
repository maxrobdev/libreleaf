import type { MetadataRoute } from "next";
import { getSiteUrl } from "./seo";
import { guides } from "../content/guides";
import { technicalDocs } from "../content/technical-docs";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await getSiteUrl();

  return [
    { url: siteUrl.href, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/lists", siteUrl).href, changeFrequency: "weekly", priority: 0.7 },
    { url: new URL("/brief", siteUrl).href, changeFrequency: "weekly", priority: 0.7 },
    { url: new URL("/send", siteUrl).href, changeFrequency: "monthly", priority: 0.7 },
    { url: new URL("/guides", siteUrl).href, changeFrequency: "monthly", priority: 0.8 },
    ...guides.map((guide) => ({ url: new URL(`/guides/${guide.slug}`, siteUrl).href, changeFrequency: "monthly" as const, priority: 0.65 })),
    { url: new URL("/developers", siteUrl).href, changeFrequency: "monthly", priority: 0.65 },
    { url: new URL("/docs", siteUrl).href, changeFrequency: "monthly", priority: 0.75 },
    ...technicalDocs.map((document) => ({ url: new URL(`/docs/${document.slug}`, siteUrl).href, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: new URL("/resources", siteUrl).href, changeFrequency: "monthly", priority: 0.6 },
    { url: new URL("/about", siteUrl).href, changeFrequency: "monthly", priority: 0.5 },
    { url: new URL("/privacy", siteUrl).href, changeFrequency: "yearly", priority: 0.2 },
    { url: new URL("/terms", siteUrl).href, changeFrequency: "yearly", priority: 0.2 },
  ];
}
