# Architecture

LibreLeaf is a work-level access resolver. It does not proxy or store book files.

## Search flow

1. The browser sends a title, author, subject or broad query to `/api/search`, with a `GB`, `US` or `GLOBAL` rights context.
2. The Edge handler queries Gutendex, Open Library, Wikisource, DOAB and the Library of Congress concurrently. Every source has its own bounded timeout, status, total and cursor position.
3. Source adapters validate response records and allowlist outbound URLs before creating access offers.
4. Exact normalized title-and-primary-author matches form one work cluster. Probable or fuzzy matches remain separate to avoid merging translations and adaptations incorrectly.
5. The response retains every source record and offer, adds a plain-English ranking explanation, and returns an opaque cursor. A timed-out source does not advance, so a later page can retry it.
6. The UI reveals 24 loaded records at a time. Once the local batch is exhausted, it passes the opaque cursor back to the API and merges the next source pages.

Open Library editions are deliberately excluded from the search fan-out. A reader can request the first bounded edition page through `/api/editions` from a work's details panel. Edition links are labelled as unchecked catalogue or availability routes; no copyright conclusion is inferred.

## Rights model

An offer can be source-assessed public domain, openly licensed, source-policy free, or merely source-provided access. The selected country changes the explanation and applicability label, not copyright law. See [SOURCE_POLICY.md](SOURCE_POLICY.md) for the source-by-source rules.

## Runtime surfaces

- `app/` contains React routes and the shared search, lists and editions handlers.
- `components/` contains the resolver UI and reusable book cards.
- `lib/sources/` contains typed catalogue adapters.
- `mcp/` exposes `search_books` and `resolve_access` over Streamable HTTP.
- `netlify/edge-functions/` places latency-sensitive public APIs near users.
- `netlify/functions/` hosts MCP and Node fallbacks.
- `netlify/{search,lists,about,resources}/index.html` gives each public SPA route distinct crawlable metadata.
- `tests/` covers source normalization, cursors, editions, MCP contracts, rendered output and SEO documents.

`npm run build` produces the vinext server build used by rendering tests. `npm run build:netlify` produces the multi-page SPA deployment in `dist/netlify`. `npm run check` is the CI gate.

## State and caching

Saved book IDs remain in browser `localStorage`; there is no account database. Search and list responses use CDN caching with stale-while-revalidate. Edition responses use a longer cache because work editions change less often. Source failures remain isolated and are never cached as successful results.
