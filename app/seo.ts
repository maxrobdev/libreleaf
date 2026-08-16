import { headers } from "next/headers";

const LOCAL_SITE_URL = new URL("http://localhost:3000");

function parseSiteUrl(value: string | undefined): URL | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return new URL(url.origin);
  } catch {
    return null;
  }
}

export async function getSiteUrl(): Promise<URL> {
  const configuredUrl =
    parseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    parseSiteUrl(process.env.SITE_URL) ??
    parseSiteUrl(process.env.URL) ??
    parseSiteUrl(process.env.DEPLOY_PRIME_URL);

  if (configuredUrl) return configuredUrl;

  const incoming = await headers();
  const forwardedHost = incoming.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || incoming.get("host");
  if (!host) return LOCAL_SITE_URL;

  const forwardedProtocol = incoming.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";

  return parseSiteUrl(`${protocol}://${host}`) ?? LOCAL_SITE_URL;
}
