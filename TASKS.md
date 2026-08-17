# LibreLeaf task ledger

This is the shared implementation queue for maintainers and coding agents. Claim one bounded task, record the owner and files before editing, and update its status and verification notes when handing it back.

## Product goal

LibreLeaf is an open-access resolver: one canonical work, every lawful access route, retained source provenance, jurisdiction context, and a plain-English explanation of rank. Search must keep paging each catalogue until it is exhausted. It must not imply that a source's copyright assessment applies in every country.

## Working rules

- Use official, lawful catalogues and access routes. Do not add shadow libraries, torrent indexes, mirrors, or download brokers.
- Never commit credentials, Netlify tokens, account identifiers, private URLs, or local environment files.
- Do not proxy or store book files unless a later design has explicit security, privacy, abuse, retention, and rights review.
- Keep interface copy short. Titles state the job; supporting text appears only where it prevents a mistake.
- Build mobile-first. Result and list grids use two compact columns where covers are shown.
- Source failures are isolated. Return useful partial results and retry without advancing a failed source cursor.
- Every direct route names its source, access type, rights context, and whether local-law checking is needed.
- Add tests and run `npm run check` before handoff.

## Conversation request audit

Every substantive product request from the build conversation is represented below. Repeated wording is consolidated into one verifiable outcome.

### Done and live

- Lawful-source boundary: no torrent, Anna's Archive, LibGen, shadow-library, mirror, or broker integration; the exclusion is explicit in docs and source policy.
- Public open-source repository under `maxrobdev/libreleaf`, MIT licence, first-person project README, contribution/security/conduct templates, CI, issue templates, and private vulnerability reporting.
- Netlify production site at `https://libreleaf-books.netlify.app`, with static route fallbacks and API/edge-function routing.
- Empty-by-default unified home/search page, title/author/subject modes, URL state, 24-result visual batches, and upstream paging until each source is exhausted.
- Canonical work view, exact clustering, stable work IDs/permalinks, all retained offers/source records, source provenance, region context, and plain-English RRF reasons.
- Five independent lawful sources: Project Gutenberg, Open Library, Wikisource, DOAB, and Library of Congress; one failed source no longer takes down search.
- UK/US/global context selector and corrected Gutenberg copy: Gutenberg's public-domain assessment is US-based and is never presented as a UK legal determination.
- Smart search caching, stale source pages, bounded browser cache, source budgets/circuit breaking, non-advancing failed cursors, and safe source-health diagnostics.
- Country-aware open-access search, direct download/read/borrow/preview routes, on-demand Open Library editions, and source-specific rights notes.
- Home rebuilt as the search interface with a preloaded ten-book shelf, two-column mobile shelf, and no first-paint catalogue fan-out.
- Clicking a result cover or title opens its inline route menu rather than searching again; Download and Read actions align in one row.
- Shared responsive navigation with compact Tools menu; API, MCP, Briefleaf, LeafSend, Book tools, GitHub, About, Search, Lists, Guides, and Saved are reachable without an overlong desktop bar.
- Home and Search are the same search-first interface at `/`; `/search` remains a non-indexed compatibility route for old shared links.
- Neutral selected/open styling: decorative green active underlines, left rails, and open-control rings removed while accessible focus states remain.
- `/lists` is a separate page with 21 curated topics/168 books, two-column mobile grids, collapsed sections, cached live feeds, and useful static fallback when feeds fail.
- Empty/unavailable Open Library trending blocks are hidden; live lists are progressive enhancement rather than required page content.
- `/resources` Book tools directory with official Calibre, KOReader, Gutenberg, Standard Ebooks, LibriVox, Open Library, and GOV.UK library links.
- `/send` LeafSend local-first EPUB/PDF/MOBI share/save workflow with official Kindle and Kobo paths and no upload/proprietary-integration claim.
- `/brief` Briefleaf reviewed country RSS-to-EPUB tool, country/topic selector, preview, explainer, attribution, official source links, and LeafSend handoff.
- Twelve crawlable, distinct guides covering mobile reading, Android/iPhone EPUB, Kindle, Kobo, Calibre, UK/US public domain, OA research, MCP, API, formats, and source verification.
- Public read-only `/api/v1` resolver endpoints, OpenAPI JSON, `/developers`, and MCP tools for search, fetch, canonical resolution, offers, provenance, and ranking explanation.
- UK/mobile technical SEO: en-GB metadata, canonical URLs, Open Graph/Twitter, structured data, manifest, robots, full sitemap, and guide/article schemas.
- Production/share artwork is a 1200×630 LibreLeaf image with intact book spines, an oxblood top book, and a contrasting leaf from the gap between books.
- Public-repository security baseline: no committed deployment credentials, secret scanning/push protection, Dependabot, immutable CI action SHAs, URL/host allowlists, input caps, CSP/security headers, and documented review.

### Completed in the 2026-08-17 release

- Lists open-and-resolve cache: opening a curated title automatically fetches and locally caches compact access routes; no second “Resolve access” click. Desktop topic grids use six compact covers. See LL-020.
- Search controls: restored centred hero and tags, query-first controls, compact country/mode row, 16px mobile inputs, small Search action, aligned access actions, and unified `/` search URLs. See LL-022.
- Briefleaf: repaired cross-runtime RSS fetches, added a reviewed multi-feed directory, combined editions, inline reader themes, and inline EPUB share/save. See LL-021/LL-027.
- Release checks and production smoke tests completed on Netlify deploy `6a824a61c66dcdcbc00d952e`. See LL-024.

### Current release candidate

- Search composer: one stable desktop/mobile bar, compact 30 px submit action, active mode/region summary in the bar, animated model-picker-style options panel, outside-click/Escape dismissal, and no zero-count or button treatment on Saved.
- Briefleaf: The Guardian added as a second reviewed UK publisher; publisher-supplied `content:encoded`/Atom article text is sanitised and available in the side reader and EPUB, while summary-only feeds remain clearly labelled and link to the original article. Source status is collapsed by default.
- Deployment and production verification are in progress; do not call these changes live until LL-024 records the new deploy ID.

### Next / not yet implemented

- Custom domain research and migration, including live price/renewal/trademark checks and coordinated canonical redirects. See LL-012.
- Open, self-hostable resolver database/index with checked-in migrations, reproducible importers, exports, and optional replaceable search engine. See LL-017.
- More country/language sources, LibriVox audio, approved Standard Ebooks feed, national libraries, university OA catalogues, and additional Wikisource editions. See LL-010/LL-018.
- Education section and source-cited reading-set tools. See LL-019.
- Subtle, disclosed, edition-aware affiliate purchase fallback only when no open route exists. See LL-013.
- Verified Buy Me a Coffee/support destination; do not invent a handle. See LL-025.
- Public-domain quotation annotations for selected curated lists, with source/edition attribution and jurisdiction review. See LL-026.
- Physical-device LeafSend verification on iPhone/Android plus Kindle/Kobo workflows. See LL-001.
- ChatGPT/MCP directory submission and production client examples. See LL-015.
- Research-led rewrite of the existing twelve guide/blog pages without changing their stable URLs. See LL-028.
- Rust/Python offline ingestion is reserved for high-volume index building only; the latency-sensitive web/API remains TypeScript until profiling justifies a split. See LL-017.

## P0 — current product pass

### LL-001 · LeafSend wireless handoff

- Status: provisional implementation; v2 UX and physical-device verification required
- Owner: edition_resolver agent
- Build `/send` as a local-first tool for EPUB, PDF, and MOBI files.
- Use the browser/OS file-share sheet where supported; files remain on the user's device.
- Include honest official Kindle and Kobo handoff paths and a normal download/save fallback.
- Do not claim direct proprietary integration where none exists.
- Add crawlable metadata, navigation, accessibility, responsive states, and tests.
- Acceptance: a supported mobile browser can select a local file and invoke the system share sheet; unsupported browsers receive a useful official workflow.
- Verification: `npm run check` passes; `/send` server-renders with HTTP 200; focused tests cover EPUB/PDF/MOBI limits, exact Web Share payloads, the local download fallback, no upload code, official Amazon/Kobo links, crawlable metadata, navigation and sitemap inclusion. The in-app browser was unavailable, so the physical mobile share sheet remains a post-deploy device check.
- Next pass: simplify the interaction, add a clear capability result before file selection, test real EPUB/PDF/MOBI handoff on iPhone and Android, test installed Apple Books/Kindle/KOReader targets, improve failure recovery, and remove any step that implies unsupported direct Kobo/Kindle integration.

### LL-002 · Reliable curated lists

- Status: complete; LL-020 enhancement in progress
- Owner: search_page agent
- Files: `components/ListsPage.tsx`, `components/ListsPage.module.css`, `components/curatedLists.ts`, `app/lists/page.tsx`, list-specific Netlify routing/metadata, and list tests.
- Add stable curated topics: classics, fiction, nonfiction, history, philosophy, science, politics, poetry, children, and short reads.
- Keep live catalogue lists as progressive enhancement, not the only content.
- Cache successful live results and serve stale/static content when upstreams fail.
- Collapse sections by default on mobile and show useful item counts.
- Acceptance: `/lists` remains useful with every upstream disabled and no section is permanently expanded on a narrow viewport.
- Verification: static lists cover every required topic with six entries each; all topic/live sections render as closed `<details>`; live payloads use a seven-day client cache and stale state; `/api/lists` has an explicit pre-SPA Netlify route. `npm run check` passes.

### LL-003 · Home parity and cached shelf

- Status: complete
- Owner: root agent
- Bring home up to the quality and utility of search and lists.
- Add a preloaded, versioned shelf of useful open books so first paint does not fan out to every catalogue.
- Refresh from cached server data only when appropriate; avoid a search request on every home visit.
- Keep the desktop hero short and the mobile book shelf two columns.
- Acceptance: useful books render without catalogue network access; search remains empty by default.

### LL-004 · Access-panel interaction redesign

- Status: complete
- Owner: root agent
- Clicking a cover or book title opens the inline access panel; it must not start another search.
- Replace the current clunky overlay with a compact sheet/popover that prioritises the best route and progressively reveals alternatives, provenance, rights, and editions.
- Remove decorative green outlines/rings from open/details controls. Preserve a clear accessible focus style using the neutral system.
- Acceptance: title, cover, keyboard activation, close, Escape, and focus return all work; primary download/read action is visible without scanning a wall of links.

### LL-005 · Timeout and source-health pass

- Status: complete
- Owner: source_reliability agent
- Files: `app/api/search/route.ts`, `components/BookCard.tsx`, `components/SearchResultsPage.tsx`, `tests/search-route.test.ts`, and source-health documentation.
- Measure production latency and failure rate for every source.
- Reduce blocking latency with per-source budgets, stale caches, circuit breaking, background refresh where supported, and less alarming partial-result copy.
- Preserve independent cursors on failure.
- Acceptance: one slow catalogue does not delay useful first results beyond the agreed budget; diagnostics identify the failing source without exposing internals to readers.
- Implementation: all source fetches share a 2.5-second first-results deadline; Open Library no longer retries inline. Exact successful pages have a bounded, 24-hour failure-only stale cache, and two consecutive failures open a 30-second per-isolate circuit. Stale, deferred and failed sources never advance their cursor. API diagnostics contain only rounded duration, attempted/cache/circuit state, and status. The browser cache is bounded and partial entries revalidate after 15 seconds.
- Verification: `npm run test:search` passes 13 tests, including an abort-aware slow source, unchanged failed cursors, exact stale fallback, circuit skip, and all-source failure; `npm run lint`, `npm run build`, and `npm run build:netlify` pass.
- Live measurement (2026-08-16, London): the deployed search returned HTTP 200 in 7.601 s before this pass. Direct source checks for the same query measured Gutendex 3.936 s, Open Library no response before 12.003 s, Wikisource 0.330 s, DOAB 1.632 s, and Library of Congress 1.123 s. The updated local handler against those live sources returned 38 books in 2.046 s: Gutendex 75 ms, Open Library timed out at 2.025 s, Wikisource 375 ms, DOAB 1.450 s, and Library of Congress 800 ms. These are point-in-time operational measurements, not availability guarantees.

### LL-006 · Public resolver API

- Status: complete
- Owner: edition_resolver agent
- Stabilise and document versioned read-only endpoints for search, exact work resolution, offers, editions, lists, source health, and cursors.
- Publish OpenAPI JSON, examples, errors, cache behaviour, rights fields, fair-use limits, contact, and changelog policy.
- Reuse the same canonical identity and resolver as the web UI and MCP.
- Acceptance: a third-party client can search, page, resolve one work, and understand every access/rights label without scraping HTML.

### LL-007 · Repository and deployment security audit

- Status: complete
- Owner: root agent
- Scan tracked files and history for credentials and sensitive Netlify/GitHub configuration.
- Confirm deploy tokens remain only in provider secret stores; use least privilege and documented rotation.
- Review dependencies, headers, CORS, URL allowlists, SSRF boundaries, input limits, cache poisoning, open redirects, MCP inputs, and file-handling code.
- Add automated secret/dependency/security checks that are appropriate for a public repository.
- Acceptance: findings are documented and fixed or explicitly risk-accepted; a clean checkout contains no deployment authority.

### LL-008 · Concise copy and visual consistency

- Status: complete; continuous review
- Owner: root agent
- Remove headings and paragraphs that repeat what the UI already shows.
- Specifically remove phrases such as “Tools that do a clear job” and redundant official-links explanations from the resources page.
- Keep activist/open-source positioning in About and project docs, not repeated above each control.
- Acceptance: every page has one clear title, task-first controls, and no marketing filler.

### LL-020 · Cached inline resolution for curated lists

- Status: complete and deployed
- Owner: root agent
- Opening a curated book must begin title-and-author-aware resolution automatically and show direct routes inside the list item.
- Store only the compact chosen result/routes in a bounded 24-hour local cache; never store full catalogue responses or reader history remotely.
- Deduplicate concurrent requests, preserve a full-work fallback, and isolate errors to the opened item.
- Use six compact poster columns on wide desktop, four on medium screens, and two on mobile.
- Acceptance: a cached title opens immediately; an uncached title exposes direct Download/Read/Borrow/Preview routes after one expansion with no “Resolve access” step.

### LL-021 · Briefleaf production RSS incident

- Status: complete and deployed
- Owner: source_reliability agent
- Reproduce `/api/brief` and `/api/brief/epub` failures on the deployed Netlify path and distinguish routing, outbound network, parser, timeout, cache, and publisher-feed causes.
- Preserve reviewed exact-feed allowlists, publisher attribution, partial success, stale fallback, byte/time/item bounds, and sanitised publisher-feed-text EPUB generation.
- Add regression coverage for the actual production failure and document current official-feed health.
- Acceptance: at least one reviewed source produces a preview and valid EPUB when other feeds fail; total failure gives a useful source-level error rather than a broken tool.

### LL-022 · Search-control UX pass

- Status: complete and deployed
- Owner: root agent
- Put the query field first; present active search mode and rights country as one compact in-bar state control.
- Keep the bar fixed while an animated, model-picker-style option panel opens beneath it; close on outside click or Escape.
- Keep focused mobile query input at a real 16 px minimum to prevent iOS Safari focus zoom; use a compact round submit action without shrinking the query field.
- Keep result access filters on one horizontally scrollable row and keep Download/Read card actions aligned.
- Acceptance: a 320–430 px viewport retains a useful query field without horizontal page overflow; desktop remains compact and keyboard accessible; selecting mode/region updates the in-bar summary.

### LL-023 · Social/share artwork correction

- Status: complete
- Owner: root agent
- Replace the incorrect torn/exposed book edge with three intact bound spines, use an oxblood top book, and place a visible green leaf from the gap between books.
- Publish at the standard 1200×630 size and retain exact LibreLeaf text.
- Acceptance: the deployed `/og.png` byte hash matches the reviewed workspace asset and all Open Graph/Twitter metadata points to it.

### LL-024 · Release and production verification

- Status: complete
- Owner: root agent
- Run `npm run check`, deploy the exact verified tree, and smoke test production pages, search/API, RSS/EPUB, Lists interactions, Book tools, Guides, share image, and security headers.
- Click the homepage Frankenstein link in production and assert useful results rather than only checking HTTP status.
- Verify desktop and narrow-screen search/list layout before reporting completion.
- Acceptance: deployment URL/ID and measured smoke results are recorded; no local-only fix is called shipped.
- Verification: `npm run check` and the production-equivalent Netlify CLI build pass. Deploy `6a824a61c66dcdcbc00d952e` serves the centred tagged hero, static starter shelf, unified root search, Lists, Briefleaf, Book tools, Guides, Developers, LeafSend and social image. Production Frankenstein search returned 24 visible cards without a page error; the resolver API returned useful partial results with an independent cursor; combined BBC/NPR preview returned 24 attributed items and a valid EPUB.

### LL-025 · Verified maintainer support link

- Status: next; blocked on a verified destination
- Owner: maintainer
- Add a subtle support page/link to the maintainer's real Buy Me a Coffee account only after the exact public handle is confirmed.
- Keep support optional and separate from result ranking, downloads, and access routes.
- Acceptance: no invented handle, no dark pattern, and the destination is verified before publication.

### LL-026 · Attributed list quotations

- Status: next
- Owner: unclaimed
- Add a small number of useful quotations to selected curated lists where the quotation genuinely explains the list.
- Use public-domain or openly licensed text, keep excerpts short, attach author/work/source edition, and apply the selected country context.
- Acceptance: no decorative invented quotes, no unattributed text, and the list remains compact when collapsed.

## P1 — discovery and reach

### LL-016 · Briefleaf RSS editions

- Status: complete and deployed
- Owner: source_reliability agent
- Files: `app/brief/page.tsx`, `components/Briefleaf.tsx`, `lib/brief/**`, `app/api/brief/**`, `netlify/edge-functions/brief*.ts`, `netlify/brief/index.html`, `tests/brief.test.ts`, and `docs/BRIEFLEAF.md`.
- Build `/brief` as a fast country-news-to-EPUB tool for e-readers and Apple Books.
- Start with a small reviewed set of official RSS feeds for the UK, US, Canada, Australia, New Zealand, Ireland, and a global option.
- Let the reader choose country and topic, preview headlines, and download one lightweight EPUB containing feed-supplied titles, dates, short summaries, source names, and links to the original reporting.
- Reuse LeafSend for device handoff where possible.
- Do not reproduce full articles, bypass paywalls, accept arbitrary server-fetched feed URLs, run scripts from feeds, or imply that inclusion is editorial endorsement.
- Cache and sanitise feed data; use strict host allowlists, byte/time/item limits, isolated source failures, and clear freshness timestamps.
- Acceptance: with at least one feed unavailable, a user can still create a valid EPUB quickly and open/share it on iPhone or an e-reader workflow; generated content retains source attribution and original links.
- Verification: `npm run test:brief` passes five tests, including isolated source failure and EPUB 3 container checks; `npm run lint`, `npm run test:seo`, `npm run build:netlify`, and `npm run build` pass.
- Live check (2026-08-16): the reviewed top-story feeds for BBC, NPR, Global News Canada, SBS, RNZ, RTÉ, and UN News responded within the 2.5 second source deadline. A direct aggregate returned 24 GB items in 165 ms, 24 global items from two live sources in 31 ms, and 10 Canadian items in 641 ms. Results vary with publisher availability; the UI exposes live, cache, stale, and unavailable states.

### LL-009 · SEO guide library

- Status: complete
- Owner: search_page agent
- Files: `content/guides.ts`, `components/GuidesHub.tsx`, `components/GuideArticlePage.tsx`, guide styles, `app/guides/**`, guide tests, and coordinated guide additions to shared navigation/sitemap/Netlify route files.
- Build a crawlable `/guides` hub and at least ten substantive, non-duplicative articles:
  1. Read free lawful books on a phone
  2. Download and open EPUB files on Android
  3. Download and open EPUB files on iPhone and iPad
  4. Send an ebook to Kindle
  5. Add an ebook to Kobo
  6. Use Calibre with open books
  7. Public domain in the UK versus the US
  8. Find openly licensed academic books
  9. Use the LibreLeaf MCP server
  10. Use the LibreLeaf public API
  11. EPUB, PDF, MOBI, and web reading compared
  12. Verify a book's source, licence, and edition
- Use accurate headings, author/date, canonical URLs, Article/Breadcrumb structured data, internal links, sitemap entries, and useful examples.
- No keyword stuffing, invented claims, filler, or copied publisher text.
- Acceptance: at least ten pages are server/crawler-visible and each answers a distinct search intent.

### LL-010 · More lawful sources and countries

- Status: ongoing
- Owner: unclaimed
- Evaluate official sources by country/language before implementation. Record API terms, rights model, paging, identifiers, file-link policy, availability, rate limits, and expected latency.
- Prioritise sources that improve canonical-work coverage or add a real lawful route, not duplicate metadata.
- Candidate classes: national libraries, legal-deposit/public-domain portals, university presses, OA monographs, official Wikisource language editions, and library lending catalogues.
- Never infer country legality from language, server location, or a broad source label.
- Acceptance: each added adapter has fixtures, timeout/isolation behaviour, provenance, host allowlists, cursor support, and jurisdiction-safe copy.

### LL-011 · Search depth and quality

- Status: ongoing
- Owner: unclaimed
- Continue beyond the current catalogue set while preserving independent exhaustive paging.
- Improve canonical clustering with identifiers and edition relationships before fuzzy matching.
- Evaluate ranking on a small published judgement set; keep RRF inputs and any boosts explainable.
- Acceptance: quality changes include before/after metrics and do not silently merge translations, abridgements, or adaptations.

### LL-012 · Domain, technical SEO, and indexing

- Status: ready
- Owner: unclaimed
- Select a short available domain only after live registrar-price verification and trademark/basic collision checks.
- Move canonical URLs, sitemap, metadata, MCP/API docs, and redirects together.
- Submit sitemaps and monitor indexing without promising placement.
- Acceptance: one production origin, no duplicate canonical hosts, valid structured data, and clean redirects from the Netlify subdomain.

## P2 — sustainable operation

### LL-017 · Open resolver index (v0.2)

- Status: next version after current deployment
- Owner: unclaimed
- Replace latency-sensitive live fan-out as the primary path with a scheduled, source-attributed canonical-work index.
- Use an open schema, checked-in migrations, reproducible importers, documented retention, and full JSON/CSV export. The complete stack must run without Netlify and without a proprietary hosted database.
- Keep every raw source identifier, fetch timestamp, licence/rights statement, jurisdiction, offer URL, and canonical merge decision auditable. Never overwrite source claims with a synthetic global rights flag.
- Use live adapters for refresh and availability checks, not as the only copy of catalogue metadata. Failed refreshes keep the last known record with visible freshness.
- Evaluate PostgreSQL full-text search plus a replaceable optional search engine; do not make ranking dependent on a closed model or vendor-only feature.
- Acceptance: a clean self-hosted install can ingest fixtures, build the canonical index, search locally, export its data, and reproduce every merge/rank explanation.

### LL-018 · Source expansion programme (v0.2)

- Status: next version after current deployment
- Owner: unclaimed
- Add sources only through documented adapters and a source-review checklist covering official status, API/feed terms, identifiers, paging, host allowlists, update cadence, rights model, geography, and failure behaviour.
- Priorities: LibriVox audio, approved Standard Ebooks OPDS access, national-library digital collections, university-press OA books, additional Wikisource language editions, and country-specific public-domain catalogues.
- Do not add a source merely to increase a counter. It must add a distinct lawful route, edition, language, jurisdiction signal, or canonical identifier.
- Acceptance: Gutenberg is not a majority of the published judgement-set routes when other reviewed sources contain the requested work; source share and failure rates are reported without tracking readers.

### LL-019 · Education section (v0.2)

- Status: next version after current deployment
- Owner: unclaimed
- Add `/education` for teachers, students, librarians, and independent learners: source-verification exercises, classroom reading sets, citation exports, accessible-format guidance, and public-domain/open-licence literacy.
- Keep it practical and evidence-led; no generic course-marketing copy and no claim that LibreLeaf replaces institutional copyright advice.
- Acceptance: educators can build and share a source-cited reading set whose edition, access route, licence note, and country context remain attached.

### LL-013 · Subtle buy fallback

- Status: design required
- Owner: unclaimed
- Resolve the real edition/work first, then show a small “Buy a copy” option only when no lawful free/read/borrow route exists or a reader explicitly asks for purchase options.
- Use reputable booksellers, edition-aware identifiers, regional availability, and a visible affiliate disclosure near the link.
- Affiliate commission is allowed only with clear nearby disclosure. It must never affect open-access ranking, hide a free route, or disguise a commercial link as a download.
- Complete UK ASA/CAP and programme-terms review before enabling tracking.
- Acceptance: the purchase link resolves to the correct real book/edition where possible; open routes remain primary; commercial ranking is separate, disclosed, and independently testable.

### LL-014 · Live-list maintenance

- Status: ready after LL-002
- Owner: unclaimed
- Track feed freshness, parser failures, cache age, and removal of unavailable routes.
- Provide a lightweight maintainer health report without user tracking.
- Acceptance: stale or failed sources degrade to curated lists and can be diagnosed without reading production logs manually.

### LL-015 · MCP and agent ecosystem

- Status: ongoing
- Owner: unclaimed
- Keep standard `search` and `fetch` plus resolver tools aligned with the public API.
- Add exact-work edition and source-explanation tools only when they avoid redundant surface area.
- Complete submission documentation and published examples for ChatGPT-compatible clients.
- Acceptance: MCP IDs, web permalinks, API work IDs, offers, and citations resolve to the same canonical work.

### LL-027 · Briefleaf feed directory and multi-feed editions

- Status: complete and deployed
- Owner: source_reliability agent
- Make Briefleaf useful as both a reviewed RSS discovery/consolidation tool and a news-to-EPUB builder.
- Publish a searchable/filterable directory of reviewed official news feeds by country, topic, language, and publisher.
- Let readers select several feeds, combine them into one preview, deduplicate repeated stories conservatively, retain source/date/original link, and generate one lightweight EPUB.
- Use the same selected multi-source edition in an in-browser reader mode. Provide warm and dark themes plus serif/sans reading controls, persisted locally.
- Generate the EPUB client-side/on demand, retain the returned File in memory, and expose it directly to LeafSend's Web Share handoff from a fresh explicit user gesture. Keep a local Save EPUB fallback; never upload the file merely to transfer it.
- Reader mode may display publisher/feed-supplied headline, date, source, summary, and full-content RSS text where the publisher explicitly includes it. Sanitise and cap that text; never scrape article pages or bypass publisher access controls.
- Show per-feed live/cached/stale/unavailable state so one publisher failure does not block the edition.
- Keep the registry declarative and open source. Do not fetch arbitrary user-supplied URLs server-side until a separate SSRF, redirect, DNS-rebinding, abuse, privacy, and egress design is approved.
- Acceptance: a user can select at least two publishers, see a deduplicated attributed combined edition, remove a feed, read the feed-supplied summaries in warm/dark and serif/sans modes, and export the same selection as a valid EPUB while another selected feed is unavailable.

### LL-028 · Research-led guide and blog rewrite

- Status: next; research queued after the current deployment repair
- Owner: root agent
- Re-audit every existing guide against current official primary sources: Apple, Google/Android where applicable, Amazon Kindle, Rakuten Kobo, Calibre, UK government/IPO, Project Gutenberg, Open Library/Internet Archive, the MCP specification, and LibreLeaf's published API.
- Preserve the twelve stable URLs and search intent; improve substance rather than publishing near-duplicate SEO pages.
- Add distinct crawlable tool explainers where a real search intent is missing:
  1. What Briefleaf does and how to combine reviewed RSS feeds into an EPUB
  2. How Briefleaf browser reader mode, attribution, themes, and inline device handoff work
  3. What LeafSend does, supported file/device paths, privacy, and why no proprietary wireless API is claimed
  4. What the LibreLeaf MCP server does, how its search/resolve tools work, and how provenance/rights/ranking are returned
- Link those explainers from `/brief`, `/send`, `/developers`, the Guides hub, sitemap, and relevant tool empty/help states.
- Add exact step sequences, device/version caveats, common failure recovery, rights/jurisdiction distinctions, source/edition verification, accessible-reading notes, relevant LibreLeaf examples, internal links, citations, and visible last-reviewed dates.
- Keep copy direct and developer/editorial in tone. Remove generic intros, keyword stuffing, invented claims, and promotional conclusions.
- Add an editorial source manifest and tests for minimum substance, distinctness, official citations, structured data, canonical URLs, and broken internal links.
- Acceptance: each article solves a distinct reader task, cites current official documentation, passes factual review, and is materially useful without requiring a second generic search.

## Completed foundation

- Five-source lawful resolver: Project Gutenberg, Open Library, Wikisource, DOAB, and Library of Congress.
- UK, US, and global rights-context selector with source-specific caveats.
- Independent opaque cursors with no permanent 96-result cap.
- Exact work clustering, retained source records/offers, transparent RRF ranking, and stable work permalinks.
- On-demand Open Library edition resolution.
- Citation-ready MCP `search`, `fetch`, `search_books`, and `resolve_access` tools.
- Netlify production deployment, public GitHub repository, open-source governance files, and CI.
