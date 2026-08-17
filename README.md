# LibreLeaf

Open-source search for lawful, free-to-read books.

[![CI](https://github.com/maxrobdev/libreleaf/actions/workflows/ci.yml/badge.svg)](https://github.com/maxrobdev/libreleaf/actions/workflows/ci.yml)
[![MIT Licence](https://img.shields.io/badge/licence-MIT-214c38.svg)](LICENSE)

[Use LibreLeaf](https://libreleaf-books.netlify.app/) · [Report an issue](https://github.com/maxrobdev/libreleaf/issues)

LibreLeaf resolves one work across [Project Gutenberg](https://www.gutenberg.org/), [Open Library](https://openlibrary.org/), [Wikisource](https://wikisource.org/), [DOAB](https://www.doabooks.org/), the [Library of Congress](https://www.loc.gov/) and [LibriVox](https://librivox.org/). It keeps every source record and labels download, read, listen, borrow and preview routes separately.

I built LibreLeaf because public-domain knowledge should be easy for people to find and use. I do not sell the app, hide downloads behind misleading buttons, or mix lawful catalogues with piracy sources. Every result names its source and every action says what will happen.

## What LibreLeaf does

- Searches by title, author, subject, or across every field
- Clusters exact title-and-author matches into a canonical work while retaining each source record
- Gives each canonical work a stable LibreLeaf ID and permalink shared by the web UI and MCP
- Pages every upstream independently instead of applying a permanent result cap
- Offers direct EPUB, PDF, MOBI, HTML, and plain-text links only when a source explicitly supplies them
- Labels every item as download, read, library loan, or preview
- Fuses independent catalogue positions with transparent Reciprocal Rank Fusion and explains every contributing rank
- Switches between UK, US and global source-rights context without pretending to make a legal determination
- Loads Open Library editions on demand, including language, date, ISBN and record provenance
- Filters by access type, catalogue, and format
- Sorts by relevance, title, or publication year
- Saves books locally in the reader's browser, without requiring an account
- Starts with popular open books when no search has been made
- Provides separate trending, free-download, and library lists
- Includes a directory of official ebook tools, open catalogues, and UK library services
- Combines reviewed publisher RSS feeds into an attributed browser reader and EPUB with Briefleaf
- Shares lawful access links and local EPUB/PDF/MOBI files through the modular LibreSend framework, with an optional persistent self-hosted relay
- Exposes standard citation-ready `search` and `fetch` plus focused `search_books` and `resolve_access` tools over MCP
- Works responsively across desktop and mobile layouts

LibreLeaf is intended for lawful access only. It deliberately does **not** search Anna's Archive, LibGen, torrent indexes, shadow libraries, or other sources primarily associated with unauthorised copies.

## How it works

```text
Reader's search
      │
      ▼
LibreLeaf /api/search
      ├── Gutendex ─────────────► Project Gutenberg editions and files
      ├── Open Library ─────────► works, loans and previews
      ├── Wikisource ───────────► source-hosted reading routes
      ├── DOAB ─────────────────► licensed open-access editions
      ├── Library of Congress ──► digitised records and explicit files
      └── LibriVox ─────────────► public-domain audiobook routes
      │
      ▼
Canonical work clusters with retained source records
      │
      ▼
Rank reasons, rights context and labelled access routes
```

The browser calls LibreLeaf's server-side resolver. Sources run independently with bounded timeouts, cursors and cache headers. Exact normalized title-and-primary-author matches are clustered; fuzzy matches remain separate. Source positions are combined with [Reciprocal Rank Fusion](https://research.google/pubs/reciprocal-rank-fusion-outperforms-condorcet-and-individual-rank-learning-methods/) (`k=60`), with a small disclosed exact-title or exact-author signal. A failed source keeps its cursor position so a later request can retry it.

Direct file links are exposed only when the named source supplies an allowlisted URL. Open Library records lead to its catalogue, borrowing or preview interface. Library of Congress routes remain `check-local` even when its record supplies a PDF. LibriVox recording and text assessments are US-based, so UK and global contexts remain source-jurisdiction-only. See the [source and rights policy](docs/SOURCE_POLICY.md).

## Run it locally

### Requirements

- Node.js 22.13 or later
- npm

### Setup

```bash
git clone https://github.com/maxrobdev/libreleaf.git
cd libreleaf
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

No API key or environment variable is currently required for catalogue search. The app makes live requests to public third-party APIs, so local results depend on those services being available and on your network connection.

### Useful commands

```bash
npm run dev       # start the local development server
npm run lint      # run ESLint
npm run build     # create a production build
npm run build:netlify # create the Netlify deployment
npm run libresend:relay # run the optional loopback-only encrypted relay
npm test          # build and run the Node test suite
npm run check     # run every CI check
```

## Project structure

```text
app/
├── api/search/route.ts   # catalogue aggregation, cursors and work clustering
├── api/editions/         # on-demand Open Library edition resolver
├── api/lists/            # independently cached live lists
├── about/                # project position and support page
├── lists/                # trending, download, and lending lists
├── resources/            # official tools and library directory
├── search/               # compatibility route for older shared links
├── globals.css           # visual design and responsive layout
├── layout.tsx            # fonts and search/social metadata
└── page.tsx              # unified home/search interface
components/               # shared cards, search results, and directory pages
lib/sources/              # typed source adapters and rights model
lib/libresend/            # transport registry, encryption and portable relay handler
mcp/                      # read-only Streamable HTTP MCP server
netlify/                  # route-specific SPA shells, functions and Edge adapters
docs/                     # architecture, source policy, MCP and submission notes
tests/                    # route, source, MCP, SEO and rendered-output tests
```

LibreSend is local-only by default. Its optional self-hosted relay receives client-encrypted, expiring, one-use envelopes and is deliberately disabled on the public LibreLeaf deployment. The repository includes a portable Fetch handler, memory and atomic filesystem stores, privacy-bounded relay modules, custom browser transports, a Node server, hardened Docker Compose deployment and headless SDK entry point. Operators can mount one reviewed local host extension for custom storage, policy and lifecycle code; remote loading and hot reload are excluded. See the [LibreSend guide](docs/LIBRESEND.md) and [extension contract](docs/LIBRESEND_EXTENSIONS.md).

LibreLeaf uses React 19, TypeScript, vinext, Vite, Netlify Functions and Netlify Edge Functions. Saved books remain in `localStorage`; there is no account database or tracking profile. See [Architecture](docs/ARCHITECTURE.md) and the [source policy](docs/SOURCE_POLICY.md).

## Data, rights, and attribution

LibreLeaf is an independent interface and is not affiliated with its catalogue sources.

- Project Gutenberg catalogue data is obtained through Gutendex. Individual ebook rights can vary by country; readers should check the source record and their local law.
- Open Library supplies catalogue metadata and controls its own preview and lending access.
- Wikisource copyright tags vary by work and reader location; language is not treated as jurisdiction evidence.
- DOAB records retain their publisher-supplied open licence where one is present.
- Library of Congress access routes do not establish public-domain status; its rights advisory and local-law warning remain attached.
- LibriVox audio routes retain the source's US public-domain assessment and an explicit local-law check outside the US.
- Book covers, metadata, and book files remain subject to the rights and terms stated by their respective sources.

The interface is designed around transparent linking, not republishing catalogue files. If a result appears incorrectly classified, please [report it](../../issues/new?template=content-report.yml).

## Contributing

I welcome thoughtful contributions that make lawful books easier to discover, improve accessibility, or make the project's behaviour clearer. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Good first contributions include:

- Keyboard and screen-reader improvements
- Better handling of partial catalogue outages
- Search result relevance and de-duplication improvements
- Tests for the catalogue normalisation layer
- UK English copy and documentation corrections
- Integrations with additional reputable public-domain or properly licensed catalogues

New sources must provide a credible lawful basis for access. A large catalogue alone is not enough.

## Security and privacy

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Do not include personal data, secrets, or active exploit details in a public issue.

LibreLeaf does not require an account and does not intentionally build a reader profile. Following a book link takes you to a third-party service governed by its own privacy policy.

## Licence

LibreLeaf's source code is available under the [MIT Licence](LICENSE). This licence applies to the software, not to third-party book files, covers, metadata, trademarks, or service content linked from it.
