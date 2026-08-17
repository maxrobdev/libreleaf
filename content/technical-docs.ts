export type TechnicalDocSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  code?: string;
  note?: string;
};

export type TechnicalDocReference = {
  label: string;
  url: string;
};

export type TechnicalDoc = {
  slug: string;
  title: string;
  description: string;
  category: string;
  updated: string;
  sections: TechnicalDocSection[];
  references: TechnicalDocReference[];
  related: string[];
};

export const technicalDocs: TechnicalDoc[] = [
  {
    slug: "api",
    title: "Resolver API reference",
    description: "Versioned HTTP endpoints for searching, paging and resolving canonical book works with source-labelled access and rights context.",
    category: "HTTP API",
    updated: "2026-08-17",
    sections: [
      {
        heading: "Contract",
        paragraphs: [
          "LibreLeaf exposes a read-only JSON API at https://libreleaf-books.netlify.app/api/v1. It requires no API key. GET and OPTIONS are supported, CORS is enabled, and successful responses include X-LibreLeaf-API-Version: 1.",
          "The API returns canonical works, not a flat list of interchangeable files. Each work retains sourceRecords and offers so clients can distinguish a download from a read, listen, borrow or preview route. Compatible fields can be added during v1; existing meanings are not changed without a new version.",
        ],
        bullets: [
          "GET /api/v1/search — search six catalogues and page them independently.",
          "GET /api/v1/works/{workId} — refresh one stable LibreLeaf work identity.",
          "GET /api/v1/editions?workKey=/works/OL…W — inspect a bounded Open Library edition set.",
          "GET /api/v1/lists — read independent live-list feed states.",
        ],
      },
      {
        heading: "Search and paging",
        paragraphs: [
          "Search accepts q, by, region and cursor. by is q, title, author or subject. region is GB, US or GLOBAL and selects the rights explanation shown with an offer; it is not geolocation or legal clearance.",
          "Every source advances independently. Pass nextCursor back unchanged with the same q, by and region until nextCursor is null. A timeout, stale fallback or deferred source does not advance that source position, so later requests can retry it. There is no permanent 96-result stop.",
        ],
        code: "curl 'https://libreleaf-books.netlify.app/api/v1/search?q=frankenstein&by=title&region=GB'",
        note: "partial: true means at least one catalogue was slow, stale, deferred or unavailable. Keep the useful books and inspect sources and sourceHealth instead of treating the whole page as failed.",
      },
      {
        heading: "Work and offer fields",
        bullets: [
          "canonicalId and canonicalUrl identify the work across the web UI, API and MCP server.",
          "sourceRecords retain each upstream record ID, details URL, language, country metadata and its own offers.",
          "offers retain source, access, label, URL, optional format/language and edition-specific rights metadata.",
          "why, clusterConfidence and ranking explain merging and Reciprocal Rank Fusion rather than hiding a relevance score.",
          "sources, sourceHealth and searchTiming report bounded operational state without returning reader queries or raw upstream errors.",
        ],
      },
      {
        heading: "Errors and client behaviour",
        paragraphs: [
          "Invalid input returns 400. Missing works or editions return 404. Temporary catalogue failure can return 429, 502, 503 or 504. An all-source search failure includes an unchanged cursor and source diagnostics, allowing a client to retry safely.",
          "Cache complete responses by query, search mode, region and cursor. Cache partial responses briefly, use exponential backoff, and do not crawl every page speculatively. LibreLeaf aggregates public services with their own limits and is not a bulk metadata mirror.",
        ],
        code: `const page = await fetch(
  "https://libreleaf-books.netlify.app/api/v1/search?q=frankenstein&by=title&region=GB"
).then((response) => response.json());

if (page.nextCursor) {
  const next = new URL("https://libreleaf-books.netlify.app/api/v1/search");
  next.searchParams.set("q", "frankenstein");
  next.searchParams.set("by", "title");
  next.searchParams.set("region", "GB");
  next.searchParams.set("cursor", page.nextCursor);
  console.log(await fetch(next).then((response) => response.json()));
}`,
      },
    ],
    references: [
      { label: "OpenAPI 3.1 document", url: "/openapi.json" },
      { label: "API implementation notes", url: "https://github.com/maxrobdev/libreleaf/blob/main/docs/API.md" },
      { label: "Public API source", url: "https://github.com/maxrobdev/libreleaf/tree/main/app/api/v1" },
    ],
    related: ["resolver", "source-rights", "mcp"],
  },
  {
    slug: "mcp",
    title: "MCP server reference",
    description: "Connect AI clients to LibreLeaf's public read-only Streamable HTTP tools for cited work search and source-labelled access resolution.",
    category: "AI clients",
    updated: "2026-08-17",
    sections: [
      {
        heading: "Endpoint and transport",
        paragraphs: [
          "The production MCP endpoint is https://libreleaf-books.netlify.app/mcp. It uses the official Model Context Protocol SDK with Streamable HTTP in stateless JSON-response mode. The endpoint is public, HTTPS and read-only; it has no OAuth flow, user account or write tool.",
          "An MCP-capable client should connect to that exact URL and inspect the advertised tools before use. In ChatGPT, remote MCP connections are configured through developer mode where the feature and workspace policy allow it. Public availability of the endpoint does not guarantee that a plugin listing has been reviewed or published.",
        ],
        code: "https://libreleaf-books.netlify.app/mcp",
      },
      {
        heading: "Tools",
        bullets: [
          "search(query) — return citation-ready stable work IDs, titles and canonical LibreLeaf URLs.",
          "fetch(id) — refresh a search result and return its complete resolver record, provenance, routes and rights context.",
          "search_books(query, search_by?, limit?, region?) — search six catalogues with a result limit from 1 to 20.",
          "resolve_access(title, author?, region?) — select one canonical match and return every validated attached offer plus an auditable ranking explanation.",
        ],
        note: "All four tools advertise readOnlyHint: true, destructiveHint: false and openWorldHint: true. Tool output links to source records; it never reproduces a book's copyrighted text.",
      },
      {
        heading: "Selection and result rules",
        paragraphs: [
          "Use search followed by fetch when a client needs citation-compatible retrieval. Use search_books for bounded catalogue exploration. Use resolve_access when the title is known and the useful answer is one work with all of its lawful routes.",
          "The server searches Project Gutenberg, Open Library, Wikisource, DOAB, the Library of Congress and LibriVox. It preserves download, read, listen, borrow and preview labels. GB, US and GLOBAL change source-rights context only; the model must not convert that metadata into a universal copyright claim.",
        ],
      },
      {
        heading: "Test a connection",
        paragraphs: [
          "Use MCP Inspector to list tools and make a controlled call before connecting a production workflow. Test direct, indirect and negative prompts, including requests that must not turn a preview into a download or describe a US public-domain assessment as worldwide.",
          "The repository contains protocol tests and submission cases. A public ChatGPT plugin submission is a separate OpenAI review process requiring developer or business access, listing information, policy URLs, test cases and domain verification when requested.",
        ],
        code: `npx netlify dev
npx @modelcontextprotocol/inspector
npm run test:mcp`,
      },
    ],
    references: [
      { label: "LibreLeaf MCP implementation", url: "https://github.com/maxrobdev/libreleaf/blob/main/docs/MCP.md" },
      { label: "OpenAI: build an MCP server", url: "https://developers.openai.com/plugins/build/mcp-server" },
      { label: "OpenAI: connect and test from ChatGPT", url: "https://developers.openai.com/plugins/deploy/connect-chatgpt" },
      { label: "Model Context Protocol", url: "https://modelcontextprotocol.io/" },
    ],
    related: ["api", "resolver", "source-rights"],
  },
  {
    slug: "resolver",
    title: "Resolver architecture",
    description: "How LibreLeaf clusters catalogue records into canonical works, retains editions and offers, and explains cross-source ranking.",
    category: "Architecture",
    updated: "2026-08-17",
    sections: [
      {
        heading: "Work model",
        paragraphs: [
          "LibreLeaf resolves a work across catalogues instead of treating each search hit as a separate book. A canonical work contains sourceRecords; each source record contains the offers supplied by that catalogue. This preserves the difference between a work, a publication or recording, and an access route.",
          "Stable llw1.* IDs are derived from normalized title and primary author. When usable author metadata is absent, source identity remains part of the key. IDs are shared by saved items, browser permalinks, the public API and MCP fetch.",
        ],
      },
      {
        heading: "Clustering",
        bullets: [
          "A shared Open Library work key or identifier can support an exact cluster.",
          "An exact normalized title and primary-author match can merge records while keeping every source record.",
          "Title-only or fuzzy similarity does not silently merge translations, abridgements or adaptations.",
          "Prefer visible duplicates over a false canonical merge when evidence is incomplete.",
        ],
      },
      {
        heading: "Ranking",
        paragraphs: [
          "Every source record retains its catalogue position. LibreLeaf combines those positions with Reciprocal Rank Fusion using k=60, then applies a small disclosed exact-title or exact-author signal. A result can therefore benefit from independent source agreement without one catalogue's score dominating the others.",
          "The response exposes the fusion method, contributing ranks and plain-English why values. Ranking never treats affiliate revenue, a file format or a hidden model score as relevance evidence.",
        ],
        code: "rrfScore = Σ 1 / (60 + sourceRank)",
      },
      {
        heading: "Availability and editions",
        paragraphs: [
          "Search returns source-provided routes that passed protocol and host allowlists. It does not proxy book files. Open Library editions are loaded only when requested because edition fan-out would slow every search and can confuse work-level relevance.",
          "A current offer can still change after it is indexed. Availability links, source timestamps and rights notes should stay visible. Clients must not substitute one translation or edition merely because its title is similar.",
        ],
      },
    ],
    references: [
      { label: "LibreLeaf architecture", url: "https://github.com/maxrobdev/libreleaf/blob/main/docs/ARCHITECTURE.md" },
      { label: "Open Library work and edition API", url: "https://openlibrary.org/dev/docs/api/search" },
      { label: "Reciprocal Rank Fusion research", url: "https://research.google/pubs/reciprocal-rank-fusion-outperforms-condorcet-and-individual-rank-learning-methods/" },
    ],
    related: ["api", "resolver-index", "source-rights"],
  },
  {
    slug: "source-rights",
    title: "Sources and rights model",
    description: "Source interfaces, access types, jurisdiction context and the evidence LibreLeaf keeps with each book route.",
    category: "Provenance",
    updated: "2026-08-17",
    sections: [
      {
        heading: "Source set",
        bullets: [
          "Project Gutenberg through Gutendex — downloadable and web-readable editions; the public-domain assessment is US-based.",
          "Open Library — work and edition metadata with borrow and preview routes controlled by the source.",
          "Wikisource — source-hosted reading routes with work-specific public-domain or licence tags.",
          "DOAB — publisher-supplied open-access monographs and licence metadata.",
          "Library of Congress — digitised catalogue records and explicit files without an inferred public-domain conclusion.",
          "LibriVox — audiobook, RSS and MP3 routes with a US public-domain assessment.",
        ],
      },
      {
        heading: "Access is not one permission",
        paragraphs: [
          "download, read, listen, borrow and preview are separate access types. A visible web page is not automatically a permanent file, and a time-limited loan is not converted into ownership. LibreLeaf keeps the source's action label and URL rather than placing every route behind one generic download button.",
          "source-assessed-public-domain, open-licence, source-policy-free and source-provided-access describe the evidence available from the source. They do not replace local copyright analysis or edition-specific terms.",
        ],
      },
      {
        heading: "Country context",
        bullets: [
          "verified — the represented source claim or explicit licence applies to the selected context.",
          "source-jurisdiction-only — the source assessment belongs to another jurisdiction, such as a US assessment shown to a UK reader.",
          "check-local — the catalogue provides access but not enough evidence for LibreLeaf to determine local permission.",
        ],
        note: "GB, US and GLOBAL are explanation contexts, not a legal calculator. Language, server location and catalogue membership are not proof that a file is free to use in a country.",
      },
      {
        heading: "Adapter requirements",
        paragraphs: [
          "A source adapter must use an official documented interface, validate input records, allowlist returned protocols and hosts, expose its own cursor and failure state, and preserve source identifiers and rights statements. One unavailable source cannot erase useful results from another.",
          "LibreLeaf does not integrate torrent indexes, shadow libraries, mirrors or download brokers. New sources are reviewed for official status, paging, rights model, distinct coverage, update cadence and failure behaviour before code is added.",
        ],
      },
    ],
    references: [
      { label: "Full source policy", url: "https://github.com/maxrobdev/libreleaf/blob/main/docs/SOURCE_POLICY.md" },
      { label: "Project Gutenberg terms", url: "https://www.gutenberg.org/policy/terms_of_use.html" },
      { label: "Open Library developer centre", url: "https://openlibrary.org/developers/api" },
      { label: "DOAB metadata interfaces", url: "https://www.doabooks.org/en/resources/metadata-harvesting-and-content-dissemination" },
      { label: "Library of Congress JSON API", url: "https://www.loc.gov/apis/json-and-yaml/" },
    ],
    related: ["resolver", "api", "resolver-index"],
  },
  {
    slug: "resolver-index",
    title: "Open resolver index",
    description: "The self-hosted SQLite and FTS5 reference index for canonical works, provenance, refresh history and deterministic exports.",
    category: "Self-hosting",
    updated: "2026-08-17",
    sections: [
      {
        heading: "Status and boundary",
        paragraphs: [
          "The resolver index is an open local baseline for replacing latency-sensitive live catalogue fan-out. It stores metadata, source records, offers, rights statements and merge evidence; it does not store book files. It is not yet production-primary: production search still uses the six live adapters while full-catalogue imports, freshness, tombstones and deployment storage are completed.",
          "The reference implementation uses Node's built-in SQLite module and SQLite FTS5. It needs Node 22.13 or later and can run without Netlify, a proprietary database or a hosted search vendor.",
        ],
      },
      {
        heading: "Run locally",
        code: `npm run resolver:index -- init --db data/resolver-index/libreleaf.sqlite
npm run resolver:index -- ingest \
  --db data/resolver-index/libreleaf.sqlite \
  --input fixtures/resolver-index/sample.ndjson \
  --source checked-in-fixture
npm run resolver:index -- search \
  --db data/resolver-index/libreleaf.sqlite \
  --query Frankenstein \
  --region GB`,
        note: "The read-only service binds to loopback by default. A public deployment needs TLS, authentication and rate limiting at a reverse proxy.",
      },
      {
        heading: "Import and audit model",
        bullets: [
          "works store canonical display metadata and retained ranking explanations.",
          "source_records store original source IDs, URLs, language/country metadata and fetch freshness.",
          "offers store access type, URL, format, source rights statement, jurisdiction and applicability.",
          "merge_decisions store the algorithm version and evidence for every canonical association.",
          "refresh_runs retain successful and failed imports; a failed refresh never deletes the last known record.",
        ],
        paragraphs: [
          "A cursor-exhausting snapshot builder emits deterministic NDJSON and an explicit completeness report. The official Project Gutenberg weekly CSV importer adds catalogue metadata without treating Gutenberg's ebook issue date as print publication year or inventing current file offers. The DOAB OAI-PMH importer exhausts opaque resumption tokens, archives and checksums every raw page, retains DOI/ISBN/licence evidence and keeps the feed's CC0 metadata licence separate from each book's reuse terms.",
        ],
      },
      {
        heading: "Cutover criteria",
        paragraphs: [
          "The index becomes production-primary only after scheduled source-specific importers, reproducible input checksums, visible freshness, reviewed absence/tombstone rules, deployment storage and live fallback are verified. An incomplete snapshot may refresh known records but cannot prove that missing records were removed upstream.",
          "JSON and CSV exports cover every indexed table. Optional PostgreSQL or search-engine adapters must preserve the same open result contract and ranking reasons; the SQLite path remains the reproducible reference implementation.",
        ],
      },
    ],
    references: [
      { label: "Resolver index operations", url: "https://github.com/maxrobdev/libreleaf/blob/main/docs/RESOLVER_INDEX.md" },
      { label: "Index source and migrations", url: "https://github.com/maxrobdev/libreleaf/tree/main/lib/resolver-index" },
      { label: "DOAB metadata harvesting", url: "https://www.doabooks.org/en/resources/metadata-harvesting-and-content-dissemination" },
      { label: "Node SQLite API", url: "https://nodejs.org/docs/latest-v22.x/api/sqlite.html" },
      { label: "SQLite FTS5", url: "https://www.sqlite.org/fts5.html" },
    ],
    related: ["resolver", "source-rights", "api"],
  },
  {
    slug: "libresend",
    title: "LibreSend framework",
    description: "Send EPUB and PDF files to phones, Kindle and Kobo through system share, official services, same-Wi-Fi delivery or an optional encrypted relay.",
    category: "File transfer",
    updated: "2026-08-17",
    sections: [
      {
        heading: "Choose the destination",
        paragraphs: [
          "Open /send, choose Phone or tablet, Kindle, Kobo or Same Wi-Fi, then choose one EPUB, PDF or MOBI file. LibreSend keeps that selection in the browser and reveals only the routes that apply to the chosen destination. Changing the destination does not require selecting the file again.",
          "Local system share passes the real File to the operating-system share sheet. Local save uses a short-lived browser object URL. LibreLeaf does not receive either file. A lawful source link can also be shared without proxying the linked book.",
        ],
      },
      {
        heading: "Phones and tablets",
        paragraphs: [
          "On iPhone or iPad, tap Open share sheet and choose Books, Kindle or another installed reader. If it is not listed, choose More or save to Files first. Enable iCloud Drive and Books in iCloud settings only if you want Apple Books imports to sync to other Apple devices.",
          "On Android, tap Open share sheet and choose Kindle, KOReader or an installed EPUB/PDF reader. If the browser cannot share files, save the file, open Downloads and use Open with. The operating system controls which apps appear; a website cannot silently choose one.",
        ],
      },
      {
        heading: "Kindle and Kobo",
        paragraphs: [
          "For Kindle on a phone, use the share sheet and choose the Kindle app. On a computer, open Amazon's Send to Kindle page, select the same local file and sync the Kindle. Amazon's current web route accepts EPUB and PDF files up to 200 MB; its current list does not include MOBI. Email accepts up to 25 attachments totalling 50 MB from an approved sender address.",
          "For Kobo Forma, Sage, Elipsa, Elipsa 2E and Libra Colour, link Google Drive or Dropbox under More → Settings → Accounts, put the non-protected EPUB or PDF in the Kobo folder and sync. For every Kobo model, save the file, connect the reader by USB, copy it to KOBOeReader, eject and open My Books.",
          "The static /send document contains a readable e-reader fallback when an older browser cannot run JavaScript modules. It preserves instructions and official links only; it does not turn the Kindle browser into an undocumented import route.",
        ],
        note: "Amazon and Kobo do not expose a general browser API that lets LibreLeaf push a selected file into an account. LibreSend uses their supported, user-controlled routes and says when the file must be selected again.",
      },
      {
        heading: "LibreSend Local",
        paragraphs: [
          "LibreSend Local is the first-party program for computer-to-device delivery. One command opens a private localhost web interface. Choose a book there and the program serves only that file to another device on the same network. It displays a random expiring download address plus a one-book OPDS acquisition feed. Its e-ink-friendly receiving page has no JavaScript, exposes no directory listing, supports byte-range downloads and closes after 15 minutes or when the program stops.",
        ],
        code: `npx --yes github:maxrobdev/libreleaf`,
        bullets: [
          "The localhost control interface is available only on the computer and uses a random control path.",
          "Choose or drop one EPUB, PDF or MOBI in the local browser interface; no terminal file path is required.",
          "The receiving page uses no JavaScript, no web fonts and conservative HTML/CSS; EPUB/PDF responses include attachment type, content length and byte-range support.",
          "Keep both devices on the same trusted Wi-Fi.",
          "Open the printed HTTP address in the e-reader browser, or add the printed /opds address to a compatible reading app.",
          "Download the book, then use Remove book, Close LibreSend or Ctrl+C. The receiving link also expires automatically.",
          "Local HTTP is not encrypted. The random path limits accidental discovery but does not make an untrusted network safe.",
          "For a permanent library, use an authenticated calibre Content server instead of leaving this temporary bridge running.",
        ],
      },
      {
        heading: "Optional encrypted relay and SDK",
        paragraphs: [
          "The public LibreLeaf site does not operate a file relay. A reader may explicitly connect a compatible self-hosted HTTPS relay for the current page session. Relay mode encrypts the complete file in the sender's browser with AES-256-GCM, uploads only an opaque expiring envelope and keeps the decryption key in the receive-link fragment. Retrieval is atomic and destructive.",
          "lib/libresend/index.ts exports validation, browser transports, encryption, relay client, portable Fetch handler, storage interfaces and the transport registry without depending on React. Privacy-bounded modules can see method, path, origin, byte count and timestamps but never plaintext, keys or encrypted bodies. Operators remain responsible for network metadata, retention, abuse and jurisdiction.",
        ],
      },
    ],
    references: [
      { label: "LibreSend operations and protocol", url: "https://github.com/maxrobdev/libreleaf/blob/main/docs/LIBRESEND.md" },
      { label: "Host extension contract", url: "https://github.com/maxrobdev/libreleaf/blob/main/docs/LIBRESEND_EXTENSIONS.md" },
      { label: "LibreSend source", url: "https://github.com/maxrobdev/libreleaf/tree/main/lib/libresend" },
      { label: "Web Share API", url: "https://www.w3.org/TR/web-share/" },
      { label: "Amazon Send to Kindle", url: "https://digprjsurvey.amazon.co.uk/csad/help/node/G5WYD9SAF7PGXRNA" },
      { label: "Apple Books on iPhone", url: "https://support.apple.com/en-gb/guide/iphone/iphab2193d5/ios" },
      { label: "calibre Content server", url: "https://manual.calibre-ebook.com/server.html" },
    ],
    related: ["briefleaf", "resolver-index", "api"],
  },
  {
    slug: "briefleaf",
    title: "Briefleaf RSS and EPUB",
    description: "Reviewed multi-publisher RSS selection, bounded server fetching, browser reading and attributed EPUB generation.",
    category: "RSS",
    updated: "2026-08-17",
    sections: [
      {
        heading: "Reviewed feed directory",
        paragraphs: [
          "Briefleaf combines up to four reviewed publisher-controlled feeds into one browser edition or EPUB. The registry covers the UK, US, Canada, Australia, New Zealand, Ireland and a global selection. It records exact HTTPS feed URLs, publisher pages, terms pages and permitted article hostnames.",
          "Users select registry entries; they cannot supply an arbitrary server-side URL. This keeps the fetch boundary auditable and avoids turning the service into an unrestricted RSS proxy or SSRF surface.",
        ],
      },
      {
        heading: "Content boundary",
        paragraphs: [
          "Briefleaf uses only content present in RSS or Atom: headline, date, summary, publisher-supplied full-content fields, source name and original article link. It strips markup and active content, caps text and media, and never fetches article pages or bypasses publisher access controls.",
          "Some feeds contain a short summary only. Reader mode and the EPUB must say that honestly rather than presenting it as a full article. The original publisher link and attribution remain attached to every item.",
        ],
      },
      {
        heading: "Fetch and cache controls",
        bullets: [
          "Exact static HTTPS feed registry; redirects are not followed.",
          "2.5-second deadline and 256 KiB streamed-body limit per source.",
          "DTD and entity declarations are rejected; article links are hostname-allowlisted.",
          "At most four feeds, 30 parsed entries per feed and 24 emitted items per request.",
          "Source failures are isolated with five-minute fresh cache and one-hour stale-on-error fallback.",
        ],
      },
      {
        heading: "EPUB and handoff",
        paragraphs: [
          "The generated file is an EPUB 3 container with escaped XHTML, navigation and no JavaScript or remote assets. It preserves selection, attribution and original links. Browser reader mode supports warm/dark and serif/sans preferences locally.",
          "The generated File can be handed directly to LibreSend from an explicit user action or saved locally. That handoff does not require uploading the EPUB to LibreLeaf. A separate self-hosted LibreSend relay is optional and off on the public site.",
        ],
      },
    ],
    references: [
      { label: "Briefleaf source and safety policy", url: "https://github.com/maxrobdev/libreleaf/blob/main/docs/BRIEFLEAF.md" },
      { label: "Reviewed feed registry", url: "https://github.com/maxrobdev/libreleaf/blob/main/lib/brief/registry.ts" },
      { label: "RSS 2.0 specification", url: "https://www.rssboard.org/rss-specification" },
      { label: "EPUB 3.3 specification", url: "https://www.w3.org/TR/epub-33/" },
    ],
    related: ["libresend", "api", "source-rights"],
  },
];

export function getTechnicalDoc(slug: string) {
  return technicalDocs.find((document) => document.slug === slug);
}
