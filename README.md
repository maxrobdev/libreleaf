# LibreLeaf

Open-source search for lawful, free-to-read books.

[![CI](https://github.com/maxrobdev/libreleaf/actions/workflows/ci.yml/badge.svg)](https://github.com/maxrobdev/libreleaf/actions/workflows/ci.yml)
[![MIT Licence](https://img.shields.io/badge/licence-MIT-214c38.svg)](LICENSE)

[Use LibreLeaf](https://libreleaf-books.netlify.app/) · [Report an issue](https://github.com/maxrobdev/libreleaf/issues)

LibreLeaf searches [Project Gutenberg](https://www.gutenberg.org/) and [Open Library](https://openlibrary.org/) from one interface. It provides direct public-domain downloads and clearly labelled routes to borrow or preview other books at their source.

I built LibreLeaf because public-domain knowledge should be easy for people to find and use. I do not sell the app, hide downloads behind misleading buttons, or mix lawful catalogues with piracy sources. Every result names its source and every action says what will happen.

## What LibreLeaf does

- Searches by title, author, subject, or across every field
- Combines Project Gutenberg and Open Library results
- Offers direct EPUB, PDF, MOBI, HTML, and plain-text links when Project Gutenberg provides them
- Labels every item as a free download, library loan, or preview
- Filters by access type, catalogue, and format
- Sorts by relevance, title, or publication year
- Saves books locally in the reader's browser, without requiring an account
- Starts with popular open books when no search has been made
- Provides separate trending, free-download, and library lists
- Includes a directory of official ebook tools, open catalogues, and UK library services
- Works responsively across desktop and mobile layouts

LibreLeaf is intended for lawful access only. It deliberately does **not** search Anna's Archive, LibGen, torrent indexes, shadow libraries, or other sources primarily associated with unauthorised copies.

## How it works

```text
Reader's search
      │
      ▼
LibreLeaf /api/search
      ├── Gutendex ────────► Project Gutenberg editions and file links
      └── Open Library ────► catalogue records, loans and previews
      │
      ▼
Normalised, de-duplicated results
      │
      ▼
Clearly labelled download, borrow or preview action
```

The browser calls LibreLeaf's server-side search route. That route queries [Gutendex](https://gutendex.com/) for Project Gutenberg catalogue data and the [Open Library Search API](https://openlibrary.org/dev/docs/api/search), normalises both responses into one result shape, removes obvious title duplicates, and returns the combined list. Search responses are cached for five minutes.

Direct file links are exposed only for Project Gutenberg records. Open Library records take the reader to Open Library to borrow or preview under that service's own availability and terms.

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
npm test          # build and run the Node test suite
npm run check     # run every CI check
```

## Project structure

```text
app/
├── api/search/route.ts   # catalogue aggregation and result normalisation
├── about/                # project position and support page
├── lists/                # trending, download, and lending lists
├── resources/            # official tools and library directory
├── search/               # dedicated search results route
├── globals.css           # visual design and responsive layout
├── layout.tsx            # fonts and search/social metadata
└── page.tsx              # home discovery and search entry
components/               # shared cards, search results, and directory pages
netlify/                  # SPA entry and serverless search adapter
docs/                     # architecture and roadmap
tests/                    # rendered-output tests
```

LibreLeaf uses React 19, TypeScript, vinext, Vite, and Netlify Functions. Saved books remain in `localStorage`; there is no account database or tracking profile. See [Architecture](docs/ARCHITECTURE.md) for the request flow and source policy.

## Data, rights, and attribution

LibreLeaf is an independent interface and is not affiliated with Project Gutenberg or Open Library.

- Project Gutenberg catalogue data is obtained through Gutendex. Individual ebook rights can vary by country; readers should check the source record and their local law.
- Open Library supplies catalogue metadata and controls its own preview and lending access.
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
