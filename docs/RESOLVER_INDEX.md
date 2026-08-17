# Resolver index

LibreLeaf's reference index stores canonical works, source records and access offers without hiding where a claim came from. It is an open, local baseline for replacing latency-sensitive live catalogue fan-out. It does not store book files.

The implementation uses Node's built-in SQLite module and SQLite FTS5. No Netlify account, hosted database, API key or closed search service is required. Node 22.13 or newer is required because that is the project's supported runtime.

## Run it

```sh
npm run resolver:index -- init --db data/resolver-index/libreleaf.sqlite
npm run resolver:index -- ingest \
  --db data/resolver-index/libreleaf.sqlite \
  --input fixtures/resolver-index/sample.ndjson \
  --source checked-in-fixture
npm run resolver:index -- search \
  --db data/resolver-index/libreleaf.sqlite \
  --query Frankenstein \
  --region GB
```

Run the same read-only search contract as a small self-hosted service:

```sh
npm run resolver:index:serve -- \
  --db data/resolver-index/libreleaf.sqlite \
  --host 127.0.0.1 \
  --port 8789
curl 'http://127.0.0.1:8789/v1/search?q=Frankenstein&region=GB'
```

The default bind is loopback. If you deliberately bind it publicly, terminate TLS and add authentication and rate limits at a reverse proxy. The service is read-only and exposes `/v1/status` and bounded `/v1/search` only.

## Build a resolver snapshot

The snapshot tool pages LibreLeaf's public resolver with an explicit query corpus and emits import-ready NDJSON:

```sh
npm run resolver:index:snapshot -- \
  --endpoint https://libreleaf-books.netlify.app/api/v1/search \
  --queries fixtures/resolver-index/seed-queries.json \
  --output data/resolver-index/seed.ndjson \
  --region GB \
  --max-pages 100
```

It also writes `seed.ndjson.report.json`. The report records each query, pages fetched, works seen, final source states and whether its cursor was exhausted. Repeated cursors, request failures and page limits make `complete` false and give the CLI exit code `2`; an incomplete snapshot remains inspectable but must not be published as complete.

Canonical IDs are deduplicated across seed queries. Source records and distinct offers are unioned without discarding their individual rights claims. The checked-in query corpus is a small reproducible seed and judgement input, not a claim to contain an entire upstream catalogue. Full-catalogue importers should use reviewed source dumps or documented exhaustive source paging when available.

Export every indexed table as deterministic JSON:

```sh
npm run resolver:index -- export \
  --db data/resolver-index/libreleaf.sqlite \
  --format json \
  --output data/resolver-index/export.json
```

Use `--format csv --output <directory>` for separate work, source-record, offer, merge-decision and refresh-run files.

## Data contract

Imports are newline-delimited JSON. Every line has:

- `schemaVersion`, currently `1`;
- one UTC `fetchedAt` timestamp;
- optional importer `searchTerms`;
- an explicit merge method, algorithm version and human-readable evidence;
- one normalized work containing every retained source record and offer.

The schema keeps these layers separate:

1. `works` — a canonical LibreLeaf identity and display metadata.
2. `source_records` — original source and record IDs, source URL and fetch freshness.
3. `offers` — access type, URL, format, source rights statement, jurisdiction and applicability.
4. `merge_decisions` — why a source record belongs to the canonical work and which algorithm made that decision.
5. `refresh_runs` — successful and failed importer runs. A failed refresh never deletes the last known record.

Newer source snapshots replace routes only for the refreshed source record. An older snapshot cannot overwrite a newer record. This preserves a working route from another source when one catalogue changes or fails.

## Ranking

Local text search uses FTS5 BM25 over title, author and checked-in importer terms. Results expose that method and a plain-English explanation. Existing resolver RRF positions and reasons remain stored on the work; text relevance does not replace source provenance. The selected rights region changes the context shown to the caller, not text relevance and not a source's legal claim.

An optional PostgreSQL or dedicated search adapter can be added later, but it must implement the same open search/result contract and reproduce its reasons. The SQLite implementation remains the self-hosted reference path.

## Retention and operations

- Successful refreshes retain the newest version of each source record.
- Failed refreshes add an audit row and retain last-known records.
- Import files should be kept long enough to reproduce a release snapshot; published index builds should include their input checksum.
- Removal and tombstone policy is not automated yet. Until a reviewed source-specific policy exists, absence from one refresh is not treated as proof that an access route disappeared.
- Local database files live under `data/resolver-index/` and are ignored by Git. Migrations and sample inputs are versioned.
- Scheduled jobs should archive the NDJSON, report and checksum together. A report with `complete: false` may refresh known records but must not drive absence-based removal.

Production search still uses live adapters while scheduled importer coverage is built. The indexed path will be introduced as a primary read only after freshness, tombstones and deployment storage are verified; live adapters will remain as refresh and availability fallbacks.

## Primary references

- [Node.js SQLite API](https://nodejs.org/download/release/latest-v22.x/docs/api/sqlite.html)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [SQLite JSON functions](https://www.sqlite.org/json1.html)
