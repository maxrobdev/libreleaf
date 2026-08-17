PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS refresh_runs (
  run_id TEXT PRIMARY KEY,
  source_label TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  input_checksum TEXT NOT NULL,
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  status TEXT NOT NULL CHECK (status IN ('complete', 'failed')),
  error TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS works (
  canonical_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  primary_author TEXT NOT NULL,
  normalized_author TEXT NOT NULL,
  authors_json TEXT NOT NULL CHECK (json_valid(authors_json)),
  year INTEGER,
  cover TEXT,
  language TEXT,
  country TEXT,
  cluster_confidence TEXT NOT NULL CHECK (cluster_confidence IN ('exact', 'probable')),
  canonical_url TEXT,
  ranking_json TEXT CHECK (ranking_json IS NULL OR json_valid(ranking_json)),
  why_json TEXT NOT NULL CHECK (json_valid(why_json)),
  search_terms_json TEXT NOT NULL CHECK (json_valid(search_terms_json)),
  snapshot_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS source_records (
  record_key TEXT PRIMARY KEY,
  canonical_id TEXT NOT NULL REFERENCES works(canonical_id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  record_id TEXT NOT NULL,
  details_url TEXT NOT NULL,
  work_key TEXT,
  language TEXT,
  country TEXT,
  fetched_at TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (source, record_id)
) STRICT;

CREATE TABLE IF NOT EXISTS offers (
  offer_key TEXT PRIMARY KEY,
  record_key TEXT NOT NULL REFERENCES source_records(record_key) ON DELETE CASCADE,
  canonical_id TEXT NOT NULL REFERENCES works(canonical_id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  access TEXT NOT NULL CHECK (access IN ('download', 'borrow', 'preview', 'read', 'listen')),
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  format TEXT,
  language TEXT,
  rights_status TEXT,
  jurisdiction TEXT,
  rights_note TEXT,
  licence_url TEXT,
  applicability TEXT CHECK (applicability IS NULL OR applicability IN ('verified', 'source-jurisdiction-only', 'check-local')),
  checked_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

CREATE TABLE IF NOT EXISTS merge_decisions (
  decision_key TEXT PRIMARY KEY,
  canonical_id TEXT NOT NULL REFERENCES works(canonical_id) ON DELETE CASCADE,
  record_key TEXT NOT NULL REFERENCES source_records(record_key) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('single-source', 'source-work-key', 'shared-identifier', 'exact-title-primary-author', 'resolver-exact-cluster')),
  confidence TEXT NOT NULL CHECK (confidence IN ('exact', 'probable')),
  algorithm_version TEXT NOT NULL,
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json)),
  decided_at TEXT NOT NULL,
  UNIQUE (canonical_id, record_key)
) STRICT;

CREATE VIRTUAL TABLE IF NOT EXISTS work_search USING fts5(
  canonical_id UNINDEXED,
  title,
  authors,
  search_terms,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE INDEX IF NOT EXISTS source_records_canonical_idx ON source_records(canonical_id);
CREATE INDEX IF NOT EXISTS source_records_source_idx ON source_records(source, record_id);
CREATE INDEX IF NOT EXISTS offers_canonical_idx ON offers(canonical_id, active);
CREATE INDEX IF NOT EXISTS offers_record_idx ON offers(record_key, active);
CREATE INDEX IF NOT EXISTS merge_decisions_canonical_idx ON merge_decisions(canonical_id);
