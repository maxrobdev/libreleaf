import type { MetadataRoute } from "next";
import { getSiteUrl } from "./seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getSiteUrl();

  return {
    rules: [
      { userAgent: "OAI-SearchBot", allow: "/", disallow: ["/api/", "/mcp"] },
      { userAgent: "ChatGPT-User", allow: "/", disallow: ["/api/"] },
      { userAgent: "*", allow: "/", disallow: ["/api/", "/mcp"] },
    ],
    sitemap: new URL("/sitemap.xml", siteUrl).href,
  };
}
