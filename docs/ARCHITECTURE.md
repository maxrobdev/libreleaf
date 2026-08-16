# Architecture

LibreLeaf is a small catalogue aggregator. It does not proxy or store book files.

## Request flow

1. The browser sends a search to `/api/search`.
2. The server queries Gutendex and Open Library in parallel.
3. Results are normalised into one `Book` shape and obvious title duplicates are removed.
4. Project Gutenberg formats are exposed as direct links. Open Library records link back to the source for lending or preview access.

Both upstream requests have a 12-second timeout. A single upstream can fail without taking down results from the other.

## Runtime surfaces

- `app/` contains the shared React interface, routes, metadata and search handler.
- `components/` contains reusable pages and catalogue UI.
- `netlify/` provides the Netlify SPA entry and serverless search adapter.
- `public/` contains static public assets.
- `tests/` checks the rendered shell and the download/borrow labelling contract.

`npm run build` produces the vinext server build used for server-rendering checks. `npm run build:netlify` produces the Netlify deployment in `dist/netlify`.

## Data and state

Search responses are cached for five minutes. Saved book IDs remain in browser `localStorage`; there is no user database or account system.

## Source policy

New catalogue integrations must expose public-domain, openly licensed, or controlled library access with a credible rights basis. Shadow libraries, torrent indexes and disguised download brokers are out of scope.
