import type { MetadataRoute } from "next";
import { getSiteUrl } from "./seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await getSiteUrl();

  return [
    {
      url: siteUrl.href,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
