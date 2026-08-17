import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pages = [
  { file: "netlify/index.html", path: "/", title: "LibreLeaf — Open-access book resolver" },
  { file: "netlify/search/index.html", path: "/search", title: "Search open-access books | LibreLeaf", noindex: true },
  { file: "netlify/lists/index.html", path: "/lists", title: "Curated open book lists | LibreLeaf" },
  { file: "netlify/brief/index.html", path: "/brief", title: "Briefleaf RSS to EPUB | LibreLeaf" },
  { file: "netlify/send/index.html", path: "/send", title: "LibreSend — Local and encrypted ebook handoff | LibreLeaf" },
  { file: "netlify/guides/index.html", path: "/guides", title: "Ebook and open reading guides | LibreLeaf" },
  { file: "netlify/developers/index.html", path: "/developers", title: "Open book resolver API and MCP | LibreLeaf" },
  { file: "netlify/about/index.html", path: "/about", title: "About the open-source resolver | LibreLeaf" },
  { file: "netlify/resources/index.html", path: "/resources", title: "Open ebook tools and UK library resources | LibreLeaf" },
];

test("Netlify routes expose distinct crawlable metadata", async () => {
  for (const page of pages) {
    const html = await readFile(new URL(`../${page.file}`, import.meta.url), "utf8");
    const canonical = page.path === "/" || page.noindex
      ? "https://libreleaf-books.netlify.app/"
      : `https://libreleaf-books.netlify.app${page.path}/`;

    assert.ok(html.includes(`<title>${page.title}</title>`));
    assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1);
    assert.ok(html.includes(`href="${canonical}"`));
    assert.ok(html.includes(`property="og:url" content="${canonical}"`));
    assert.ok(html.includes(`<meta name="robots" content="${page.noindex ? "noindex" : "index"}, follow"`));
    assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/);

    for (const match of html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)) {
      assert.doesNotThrow(() => JSON.parse(match[1]));
    }
  }
});

test("the static sitemap covers every public route", async () => {
  const sitemap = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  for (const path of [
    "/",
    "/lists/",
    "/brief/",
    "/send/",
    "/guides/",
    "/guides/read-free-books-on-phone/",
    "/guides/open-epub-on-android/",
    "/guides/open-epub-on-iphone-ipad/",
    "/guides/send-ebook-to-kindle/",
    "/guides/add-ebook-to-kobo/",
    "/guides/use-calibre-open-books/",
    "/guides/public-domain-uk-vs-us/",
    "/guides/find-open-access-academic-books/",
    "/guides/use-libreleaf-mcp/",
    "/guides/use-libreleaf-api/",
    "/guides/ebook-formats-epub-pdf-mobi-web/",
    "/guides/verify-book-source-licence-edition/",
    "/developers/",
    "/about/",
    "/resources/",
    "/privacy",
    "/terms",
  ]) {
    const url = `https://libreleaf-books.netlify.app${path}`;
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${url} missing from sitemap`);
  }
});
