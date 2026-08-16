import type { MetadataRoute } from "next";
import { getSiteUrl } from "./seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await getSiteUrl();

  return [
    { url: siteUrl.href, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/search", siteUrl).href, changeFrequency: "weekly", priority: 0.9 },
    { url: new URL("/lists", siteUrl).href, changeFrequency: "weekly", priority: 0.7 },
    { url: new URL("/resources", siteUrl).href, changeFrequency: "monthly", priority: 0.6 },
    { url: new URL("/about", siteUrl).href, changeFrequency: "monthly", priority: 0.5 },
    { url: new URL("/privacy", siteUrl).href, changeFrequency: "yearly", priority: 0.2 },
    { url: new URL("/terms", siteUrl).href, changeFrequency: "yearly", priority: 0.2 },
  ];
}
