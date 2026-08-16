import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pages = [
  { file: "netlify/index.html", path: "/", title: "LibreLeaf — Open-access book resolver" },
  { file: "netlify/search/index.html", path: "/search", title: "Search open-access books | LibreLeaf" },
  { file: "netlify/lists/index.html", path: "/lists", title: "Live open book lists | LibreLeaf" },
  { file: "netlify/about/index.html", path: "/about", title: "About the open-source resolver | LibreLeaf" },
  { file: "netlify/resources/index.html", path: "/resources", title: "Open ebook tools and UK library resources | LibreLeaf" },
];

test("Netlify routes expose distinct crawlable metadata", async () => {
  for (const page of pages) {
    const html = await readFile(new URL(`../${page.file}`, import.meta.url), "utf8");
    const canonical = page.path === "/"
      ? "https://libreleaf-books.netlify.app/"
      : `https://libreleaf-books.netlify.app${page.path}/`;

    assert.ok(html.includes(`<title>${page.title}</title>`));
    assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1);
    assert.ok(html.includes(`href="${canonical}"`));
    assert.ok(html.includes(`property="og:url" content="${canonical}"`));
    assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/);

    for (const match of html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)) {
      assert.doesNotThrow(() => JSON.parse(match[1]));
    }
  }
});

test("the static sitemap covers every public route", async () => {
  const sitemap = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  for (const path of ["/", "/search/", "/lists/", "/about/", "/resources/", "/privacy", "/terms"]) {
    const url = `https://libreleaf-books.netlify.app${path}`;
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${url} missing from sitemap`);
  }
});
