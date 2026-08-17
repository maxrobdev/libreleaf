# LibreLeaf public API

Base URL: `https://libreleaf-books.netlify.app`

The API is read-only, requires no key, and returns the same canonical works, offers, provenance, ranking reasons, and rights context used by the web interface and MCP server. The machine-readable contract is [`/openapi.json`](https://libreleaf-books.netlify.app/openapi.json).

## Version and compatibility

Stable routes begin with `/api/v1/`. Responses include `X-LibreLeaf-API-Version: 1`. Compatible fields may be added during v1; existing fields and meanings will not be removed or changed without a new version. Changes are recorded in repository releases and the changelog.

Legacy `/api/search`, `/api/lists`, and `/api/editions` routes remain available to the LibreLeaf client but third-party clients should use v1.

## Search

```http
GET /api/v1/search?q=frankenstein&by=title&region=GB
```

Parameters:

- `q`: zero to 120 characters. Empty returns a discovery page.
- `by`: `q`, `title`, `author`, or `subject`; defaults to `q`.
- `region`: `GB`, `US`, or `GLOBAL`; defaults to `GB`.
- `cursor`: the opaque `nextCursor` from the prior response.

Each response is one page aggregated from independent source pages. Continue passing `nextCursor` unchanged until it is `null`; there is no fixed 96-result stop. Do not combine `cursor` with the compatibility `page` parameter.

`partial: true` means at least one source was slow, unavailable, deferred, or served stale data. Useful results from other sources remain valid. `sources`, `sourceHealth`, and `searchTiming` explain the state without exposing reader queries or upstream internals. A failed source's cursor does not advance, so the next page can retry it.

## Resolve a work

Take `canonicalId` from a search result:

```http
GET /api/v1/works/llw1.eyJ2IjoxLCJ0IjoiZnJhbmtlbnN0ZWluIiwiYSI6InNoZWxsZXkgbWFyeSJ9?region=GB
```

The resolver refreshes up to three catalogue pages and returns one work with all retained `offers` and `sourceRecords`. A 404 can mean the current catalogues no longer return that work or that it was not found inside the bounded refresh window; inspect `resolution.exhausted`.

Canonical IDs encode matching identity, not access permission. Use the returned edition and offer rights fields every time.

## Editions

```http
GET /api/v1/editions?workKey=%2Fworks%2FOL45804W
```

Edition lookup accepts one canonical Open Library `/works/OL…W` key and returns at most 12 records per request. Availability links are checks, not guarantees. Rights are not assessed by this endpoint.

## Lists

```http
GET /api/v1/lists
```

The endpoint returns independent live-list states. A list can be `live`, `stale`, or `unavailable`; one failed feed does not remove the others. Static curated topic lists are shipped with the web client rather than this live-feed API.

## Rights fields

`region` changes the displayed context; it is not geolocation or legal clearance.

- `verified`: the source claim or explicit licence applies to the selected context as represented.
- `source-jurisdiction-only`: the claim belongs to another jurisdiction. Project Gutenberg's public-domain assessment is US-based.
- `check-local`: the source supplies access but LibreLeaf cannot determine local permission.

Keep `rights.status`, `jurisdiction`, `note`, `licenceUrl`, and `applicability` attached to the offer. Do not turn `download` into a global public-domain claim.

## HTTP, caching, and errors

All public endpoints accept `GET` and `OPTIONS`. Other methods return 405. CORS permits read-only browser clients. Success and partial responses include public cache headers; clients should honour them, store the full response by query, mode, region, and cursor, and use exponential backoff after 429, 502, 503, or 504.

There is no promised per-client quota. The service aggregates public catalogues with their own limits. Cache responses, avoid speculative exhaustive crawls, do not use the API as a high-traffic mirror, and link readers to source records.

Common errors:

- `400`: invalid query, cursor, region, work ID, or work key.
- `404`: work or edition not found.
- `405`: method not allowed.
- `429` or `503`: a source is rate-limiting requests.
- `502` or `504`: sources are unavailable or timed out.

## Example

```js
const first = await fetch(
  "https://libreleaf-books.netlify.app/api/v1/search?q=frankenstein&by=title&region=GB",
).then((response) => response.json());

const canonical = first.books[0];
const resolved = await fetch(
  `https://libreleaf-books.netlify.app/api/v1/works/${canonical.canonicalId}?region=GB`,
).then((response) => response.json());

for (const offer of resolved.work.offers) {
  console.log(offer.source, offer.access, offer.url, offer.rights?.applicability);
}

if (first.nextCursor) {
  const next = await fetch(
    `https://libreleaf-books.netlify.app/api/v1/search?q=frankenstein&by=title&region=GB&cursor=${encodeURIComponent(first.nextCursor)}`,
  ).then((response) => response.json());
  console.log(next.books.length);
}
```

## Security and contact

The service does not accept arbitrary upstream URLs. Source adapters and returned direct routes use explicit host and protocol policies. Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/maxrobdev/libreleaf/security/advisories/new); use normal issues for API defects and proposals.
