import react from "@vitejs/plugin-react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { guides, type Guide } from "./content/guides";

const entry = (path: string) => fileURLToPath(new URL(`./netlify/${path}`, import.meta.url));

function html(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function articleShell(guide: Guide) {
  const sections = guide.sections.map((section) => `<section><h2>${html(section.heading)}</h2>${(section.paragraphs ?? []).map((paragraph) => `<p>${html(paragraph)}</p>`).join("")}${section.steps ? `<ol>${section.steps.map((step) => `<li>${html(step)}</li>`).join("")}</ol>` : ""}${section.bullets ? `<ul>${section.bullets.map((bullet) => `<li>${html(bullet)}</li>`).join("")}</ul>` : ""}${section.note ? `<p>${html(section.note)}</p>` : ""}</section>`).join("");
  return `<article><h1>${html(guide.title)}</h1><p>${html(guide.description)}</p>${sections}</article>`;
}

function guideShells(): Plugin {
  return {
    name: "libreleaf-guide-shells",
    apply: "build",
    async writeBundle(options) {
      if (!options.dir) throw new Error("The Netlify output directory was not configured.");
      const source = await readFile(join(options.dir, "guides/index.html"), "utf8");
      for (const guide of guides) {
        const url = `https://libreleaf-books.netlify.app/guides/${guide.slug}/`;
        const structuredData = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.title,
          description: guide.description,
          datePublished: guide.published,
          dateModified: guide.updated,
          author: { "@type": "Person", name: guide.author },
          publisher: { "@type": "Organization", name: "LibreLeaf", url: "https://libreleaf-books.netlify.app/" },
          mainEntityOfPage: url,
          inLanguage: "en-GB",
        }).replace(/</g, "\\u003c");
        const page = source
          .replace(/<title>[^<]*<\/title>/, `<title>${html(guide.title)} | LibreLeaf</title>`)
          .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${html(guide.description)}" />`)
          .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`)
          .replace('<meta property="og:type" content="website" />', '<meta property="og:type" content="article" />')
          .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`)
          .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${html(guide.title)} | LibreLeaf" />`)
          .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${html(guide.description)}" />`)
          .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${html(guide.title)} | LibreLeaf" />`)
          .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${html(guide.description)}" />`)
          .replace("</head>", `<script type="application/ld+json">${structuredData}</script></head>`)
          .replace('<div id="root"></div>', `<div id="root">${articleShell(guide)}</div>`);
        const target = join(options.dir, "guides", guide.slug, "index.html");
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, page, "utf8");
      }
    },
  };
}

export default defineConfig({
  root: "netlify",
  publicDir: "../public",
  plugins: [react(), guideShells()],
  build: {
    outDir: "../dist/netlify",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: entry("index.html"),
        search: entry("search/index.html"),
        lists: entry("lists/index.html"),
        brief: entry("brief/index.html"),
        send: entry("send/index.html"),
        guides: entry("guides/index.html"),
        developers: entry("developers/index.html"),
        about: entry("about/index.html"),
        resources: entry("resources/index.html"),
      },
    },
  },
});
