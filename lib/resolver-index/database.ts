import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { canonicalWorkUrl, stableWorkId } from "../work-identity.ts";
import type {
  Access,
  CatalogueSource,
  NormalisedBook,
  Offer,
  Rights,
  RightsRegion,
  SourceRank,
  SourceRecord,
  WorkRanking,
} from "../sources/types.ts";
import {
  INDEX_SCHEMA_VERSION,
  type IndexedBook,
  type IndexSearchResult,
  type MergeMethod,
  type ResolverIndexEntry,
  type ResolverIndexSnapshot,
} from "./types.ts";

const MIGRATION_URL = new URL("../../db/resolver/migrations/001_initial.sql", import.meta.url);
const MAX_ENTRIES = 100_000;
const MAX_TEXT = 4_000;
const MAX_URL = 4_096;
const MAX_RECORDS_PER_WORK = 32;
const MAX_OFFERS_PER_RECORD = 64;

const SOURCES = [
  "Project Gutenberg",
  "Open Library",
  "Wikisource",
  "DOAB",
  "Library of Congress",
  "LibriVox",
] as const satisfies readonly CatalogueSource[];
const ACCESSES = ["download", "borrow", "preview", "read", "listen"] as const satisfies readonly Access[];
const RIGHTS_STATUSES = [
  "source-assessed-public-domain",
  "open-licence",
  "source-policy-free",
  "source-provided-access",
] as const;
const APPLICABILITIES = ["verified", "source-jurisdiction-only", "check-local"] as const;
const MERGE_METHODS = [
  "single-source",
  "source-work-key",
  "shared-identifier",
  "exact-title-primary-author",
  "resolver-exact-cluster",
] as const satisfies readonly MergeMethod[];

type SqlRow = Record<string, string | number | bigint | null | Uint8Array>;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normaliseText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-GB").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string, max = MAX_TEXT) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} must be a non-empty string no longer than ${max} characters.`);
  return value.trim();
}

function stringArray(value: unknown, label: string, maximum = 128) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} must be an array with at most ${maximum} values.`);
  return value.map((item, index) => requireString(item, `${label}[${index}]`, 500));
}

function isoDate(value: unknown, label: string) {
  const date = requireString(value, label, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new Error(`${label} must be an ISO 8601 UTC timestamp.`);
  }
  return new Date(date).toISOString();
}

function safeUrl(value: unknown, label: string) {
  const urlText = requireString(value, label, MAX_URL);
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${label} must use HTTP or HTTPS.`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials.`);
  return url.toString();
}

function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${label} is not supported.`);
  return value as T;
}

function validateRights(value: unknown, label: string): Rights | undefined {
  if (value === undefined) return undefined;
  const input = requireRecord(value, label);
  return {
    status: enumValue(input.status, RIGHTS_STATUSES, `${label}.status`),
    jurisdiction: requireString(input.jurisdiction, `${label}.jurisdiction`, 200),
    note: requireString(input.note, `${label}.note`, 2_000),
    ...(input.licenceUrl === undefined ? {} : { licenceUrl: safeUrl(input.licenceUrl, `${label}.licenceUrl`) }),
    ...(input.applicability === undefined ? {} : { applicability: enumValue(input.applicability, APPLICABILITIES, `${label}.applicability`) }),
  };
}

function validateOffer(value: unknown, source: CatalogueSource, label: string): Offer {
  const input = requireRecord(value, label);
  const offerSource = enumValue(input.source, SOURCES, `${label}.source`);
  if (offerSource !== source) throw new Error(`${label}.source must match its source record.`);
  return {
    source: offerSource,
    access: enumValue(input.access, ACCESSES, `${label}.access`),
    label: requireString(input.label, `${label}.label`, 300),
    url: safeUrl(input.url, `${label}.url`),
    ...(input.format === undefined ? {} : { format: requireString(input.format, `${label}.format`, 100) }),
    ...(input.language === undefined ? {} : { language: requireString(input.language, `${label}.language`, 100) }),
    ...(input.rights === undefined ? {} : { rights: validateRights(input.rights, `${label}.rights`) }),
  };
}

function validateSourceRecord(value: unknown, label: string): SourceRecord {
  const input = requireRecord(value, label);
  const source = enumValue(input.source, SOURCES, `${label}.source`);
  if (!Array.isArray(input.offers) || input.offers.length > MAX_OFFERS_PER_RECORD) {
    throw new Error(`${label}.offers must contain at most ${MAX_OFFERS_PER_RECORD} routes.`);
  }
  return {
    source,
    recordId: requireString(input.recordId, `${label}.recordId`, 500),
    detailsUrl: safeUrl(input.detailsUrl, `${label}.detailsUrl`),
    ...(input.workKey === undefined ? {} : { workKey: requireString(input.workKey, `${label}.workKey`, 500) }),
    ...(input.language === undefined ? {} : { language: requireString(input.language, `${label}.language`, 100) }),
    ...(input.country === undefined ? {} : { country: requireString(input.country, `${label}.country`, 100) }),
    offers: input.offers.map((offer, index) => validateOffer(offer, source, `${label}.offers[${index}]`)),
  };
}

function validateRanking(value: unknown): WorkRanking | undefined {
  if (value === undefined) return undefined;
  const input = requireRecord(value, "work.ranking");
  if (input.method !== "rrf-v1" || typeof input.score !== "number" || !Number.isFinite(input.score)) throw new Error("work.ranking is invalid.");
  if (!Array.isArray(input.sourceRanks) || input.sourceRanks.length > SOURCES.length) throw new Error("work.ranking.sourceRanks is invalid.");
  const sourceRanks: SourceRank[] = input.sourceRanks.map((rankValue, index) => {
    const rank = requireRecord(rankValue, `work.ranking.sourceRanks[${index}]`);
    if (typeof rank.rank !== "number" || !Number.isInteger(rank.rank) || rank.rank < 1) throw new Error("Source rank must be a positive integer.");
    return { source: enumValue(rank.source, SOURCES, "Source rank source"), rank: rank.rank };
  });
  return {
    method: "rrf-v1",
    score: input.score,
    sourceRanks,
    reasons: stringArray(input.reasons, "work.ranking.reasons", 32),
  };
}

export function validateIndexEntry(value: unknown): ResolverIndexEntry {
  const input = requireRecord(value, "Index entry");
  if (input.schemaVersion !== INDEX_SCHEMA_VERSION) throw new Error(`Index entry schemaVersion must be ${INDEX_SCHEMA_VERSION}.`);
  const workInput = requireRecord(input.work, "work");
  if (!Array.isArray(workInput.sourceRecords) || workInput.sourceRecords.length === 0 || workInput.sourceRecords.length > MAX_RECORDS_PER_WORK) {
    throw new Error(`work.sourceRecords must contain 1-${MAX_RECORDS_PER_WORK} records.`);
  }
  const sourceRecords = workInput.sourceRecords.map((record, index) => validateSourceRecord(record, `work.sourceRecords[${index}]`));
  const flattenedOffers = sourceRecords.flatMap((record) => record.offers);
  const authors = stringArray(workInput.authors, "work.authors", 32);
  const why = stringArray(workInput.why, "work.why", 32);
  const mergeInput = requireRecord(input.merge, "merge");
  const merge = {
    method: enumValue(mergeInput.method, MERGE_METHODS, "merge.method"),
    algorithmVersion: requireString(mergeInput.algorithmVersion, "merge.algorithmVersion", 100),
    evidence: stringArray(mergeInput.evidence, "merge.evidence", 32),
  };
  if (sourceRecords.length > 1 && merge.method === "single-source") throw new Error("A multi-source work needs an explicit cluster merge method.");
  if (sourceRecords.length > 1 && merge.evidence.length === 0) throw new Error("A multi-source work needs merge evidence.");

  const work: NormalisedBook = {
    id: requireString(workInput.id, "work.id", 1_024),
    title: requireString(workInput.title, "work.title", 1_000),
    authors,
    ...(typeof workInput.year === "number" && Number.isInteger(workInput.year) && workInput.year >= -5_000 && workInput.year <= 5_000 ? { year: workInput.year } : {}),
    ...(workInput.cover === undefined ? {} : { cover: safeUrl(workInput.cover, "work.cover") }),
    source: requireString(workInput.source, "work.source", 500),
    access: enumValue(workInput.access, ACCESSES, "work.access"),
    formats: flattenedOffers.map(({ label, url }) => ({ label, url })),
    detailsUrl: safeUrl(workInput.detailsUrl, "work.detailsUrl"),
    ...(workInput.workKey === undefined ? {} : { workKey: requireString(workInput.workKey, "work.workKey", 500) }),
    ...(workInput.language === undefined ? {} : { language: requireString(workInput.language, "work.language", 100) }),
    ...(workInput.country === undefined ? {} : { country: requireString(workInput.country, "work.country", 100) }),
    clusterConfidence: enumValue(workInput.clusterConfidence, ["exact", "probable"] as const, "work.clusterConfidence"),
    why,
    offers: flattenedOffers,
    sourceRecords,
    ...(workInput.sourceRanks === undefined ? {} : { sourceRanks: validateRanking({ method: "rrf-v1", score: 0, sourceRanks: workInput.sourceRanks, reasons: [] })?.sourceRanks }),
    ...(workInput.ranking === undefined ? {} : { ranking: validateRanking(workInput.ranking) }),
    ...(workInput.canonicalId === undefined ? {} : { canonicalId: requireString(workInput.canonicalId, "work.canonicalId", 1_024) }),
    ...(workInput.canonicalUrl === undefined ? {} : { canonicalUrl: safeUrl(workInput.canonicalUrl, "work.canonicalUrl") }),
  };

  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    fetchedAt: isoDate(input.fetchedAt, "fetchedAt"),
    ...(input.searchTerms === undefined ? {} : { searchTerms: stringArray(input.searchTerms, "searchTerms", 128) }),
    merge,
    work,
  };
}

export function parseIndexNdjson(text: string) {
  if (Buffer.byteLength(text) > 100 * 1024 * 1024) throw new Error("Index input exceeds 100 MiB.");
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > MAX_ENTRIES) throw new Error(`Index input exceeds ${MAX_ENTRIES} entries.`);
  return lines.map((line, index) => {
    if (Buffer.byteLength(line) > 1024 * 1024) throw new Error(`Line ${index + 1} exceeds 1 MiB.`);
    try {
      return validateIndexEntry(JSON.parse(line));
    } catch (error) {
      throw new Error(`Invalid index entry on line ${index + 1}: ${error instanceof Error ? error.message : "invalid JSON"}`);
    }
  });
}

export function serialiseIndexNdjson(entriesInput: readonly unknown[]) {
  if (entriesInput.length > MAX_ENTRIES) throw new Error(`Index output exceeds ${MAX_ENTRIES} entries.`);
  return `${entriesInput.map((entry) => stableJson(validateIndexEntry(entry))).join("\n")}\n`;
}

export function serialiseIndexEntry(entry: unknown) {
  return `${stableJson(validateIndexEntry(entry))}\n`;
}

function rowString(row: SqlRow, name: string) {
  const value = row[name];
  return value === null || value === undefined ? undefined : String(value);
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function chooseAccess(offers: Offer[]): Access {
  return (["download", "read", "listen", "borrow", "preview"] as const).find((access) => offers.some((offer) => offer.access === access)) ?? "read";
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  return `${columns.map(csvCell).join(",")}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n")}\n`;
}

export class ResolverIndex {
  readonly database: DatabaseSync;

  constructor(path: string | URL = ":memory:") {
    if (typeof path === "string" && path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path, { allowExtension: false });
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate() {
    const sql = readFileSync(MIGRATION_URL, "utf8");
    const checksum = sha256(sql);
    this.database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;");
    const current = this.database.prepare("SELECT checksum FROM schema_migrations WHERE version = ?").get("001_initial") as SqlRow | undefined;
    if (current && rowString(current, "checksum") !== checksum) throw new Error("Resolver index migration 001_initial changed after it was applied.");
    if (!current) {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec(sql);
        this.database.prepare("INSERT INTO schema_migrations(version, checksum, applied_at) VALUES (?, ?, ?)")
          .run("001_initial", checksum, new Date().toISOString());
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }
  }

  close() {
    this.database.close();
  }

  ingest(entriesInput: readonly unknown[], sourceLabel = "manual") {
    if (entriesInput.length === 0) throw new Error("At least one index entry is required.");
    if (entriesInput.length > MAX_ENTRIES) throw new Error(`A refresh may contain at most ${MAX_ENTRIES} entries.`);
    const entries = entriesInput.map(validateIndexEntry);
    const inputChecksum = sha256(stableJson(entries));
    const runId = `llrun1.${sha256(`${sourceLabel}\n${inputChecksum}`).slice(0, 32)}`;
    const upsertWork = this.database.prepare(`
      INSERT INTO works (
        canonical_id, title, normalized_title, primary_author, normalized_author, authors_json, year, cover,
        language, country, cluster_confidence, canonical_url, ranking_json, why_json, search_terms_json,
        snapshot_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_id) DO UPDATE SET
        title=excluded.title, normalized_title=excluded.normalized_title, primary_author=excluded.primary_author,
        normalized_author=excluded.normalized_author, authors_json=excluded.authors_json, year=excluded.year,
        cover=excluded.cover, language=excluded.language, country=excluded.country,
        cluster_confidence=excluded.cluster_confidence, canonical_url=excluded.canonical_url,
        ranking_json=excluded.ranking_json, why_json=excluded.why_json, search_terms_json=excluded.search_terms_json,
        snapshot_at=excluded.snapshot_at, updated_at=excluded.updated_at
      WHERE excluded.snapshot_at >= works.snapshot_at
    `);
    const currentRecord = this.database.prepare("SELECT fetched_at FROM source_records WHERE record_key = ?");
    const upsertRecord = this.database.prepare(`
      INSERT INTO source_records (
        record_key, canonical_id, source, record_id, details_url, work_key, language, country,
        fetched_at, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(record_key) DO UPDATE SET
        canonical_id=excluded.canonical_id, details_url=excluded.details_url, work_key=excluded.work_key,
        language=excluded.language, country=excluded.country, fetched_at=excluded.fetched_at,
        last_seen_at=excluded.last_seen_at
      WHERE excluded.fetched_at >= source_records.fetched_at
    `);
    const insertOffer = this.database.prepare(`
      INSERT INTO offers (
        offer_key, record_key, canonical_id, source, access, label, url, format, language,
        rights_status, jurisdiction, rights_note, licence_url, applicability, checked_at, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const insertDecision = this.database.prepare(`
      INSERT INTO merge_decisions (
        decision_key, canonical_id, record_key, method, confidence, algorithm_version, evidence_json, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const entry of entries) {
        const work = entry.work;
        const canonicalId = work.canonicalId ?? stableWorkId(work);
        const canonicalUrl = work.canonicalUrl ?? canonicalWorkUrl(work, canonicalId);
        const primaryAuthor = work.authors[0] ?? "";
        upsertWork.run(
          canonicalId,
          work.title,
          normaliseText(work.title),
          primaryAuthor,
          normaliseText(primaryAuthor),
          stableJson(work.authors),
          work.year ?? null,
          work.cover ?? null,
          work.language ?? null,
          work.country ?? null,
          work.clusterConfidence,
          canonicalUrl,
          work.ranking ? stableJson(work.ranking) : null,
          stableJson(work.why),
          stableJson(entry.searchTerms ?? []),
          entry.fetchedAt,
          entry.fetchedAt,
          entry.fetchedAt,
        );

        for (const record of work.sourceRecords) {
          const recordKey = `llsr1.${sha256(`${record.source}\n${record.recordId}`)}`;
          const existing = currentRecord.get(recordKey) as SqlRow | undefined;
          const existingFetchedAt = existing ? rowString(existing, "fetched_at") : undefined;
          if (existingFetchedAt && existingFetchedAt > entry.fetchedAt) continue;
          upsertRecord.run(
            recordKey,
            canonicalId,
            record.source,
            record.recordId,
            record.detailsUrl,
            record.workKey ?? null,
            record.language ?? null,
            record.country ?? null,
            entry.fetchedAt,
            existingFetchedAt ?? entry.fetchedAt,
            entry.fetchedAt,
          );
          this.database.prepare("DELETE FROM offers WHERE record_key = ?").run(recordKey);
          this.database.prepare("DELETE FROM merge_decisions WHERE record_key = ?").run(recordKey);
          for (const offer of record.offers) {
            const rights = offer.rights;
            const offerKey = `llo1.${sha256(`${recordKey}\n${offer.access}\n${offer.format ?? ""}\n${offer.url}`)}`;
            insertOffer.run(
              offerKey,
              recordKey,
              canonicalId,
              offer.source,
              offer.access,
              offer.label,
              offer.url,
              offer.format ?? null,
              offer.language ?? null,
              rights?.status ?? null,
              rights?.jurisdiction ?? null,
              rights?.note ?? null,
              rights?.licenceUrl ?? null,
              rights?.applicability ?? null,
              entry.fetchedAt,
            );
          }
          const decisionKey = `llmd1.${sha256(`${canonicalId}\n${recordKey}`)}`;
          insertDecision.run(
            decisionKey,
            canonicalId,
            recordKey,
            entry.merge.method,
            work.clusterConfidence,
            entry.merge.algorithmVersion,
            stableJson(entry.merge.evidence),
            entry.fetchedAt,
          );
        }
      }
      this.database.prepare(`
        INSERT INTO refresh_runs(run_id, source_label, fetched_at, input_checksum, record_count, status, error)
        VALUES (?, ?, ?, ?, ?, 'complete', NULL)
        ON CONFLICT(run_id) DO NOTHING
      `).run(runId, sourceLabel, entries.map((entry) => entry.fetchedAt).sort().at(-1)!, inputChecksum, entries.length);
      this.database.exec("DELETE FROM works WHERE canonical_id NOT IN (SELECT DISTINCT canonical_id FROM source_records)");
      this.rebuildSearch();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return { runId, inputChecksum, recordCount: entries.length };
  }

  recordRefreshFailure(sourceLabel: string, fetchedAt: string, error: string) {
    const checkedAt = isoDate(fetchedAt, "fetchedAt");
    const safeError = requireString(error, "error", 1_000);
    const checksum = sha256(`${sourceLabel}\n${checkedAt}\n${safeError}`);
    const runId = `llrun1.${checksum.slice(0, 32)}`;
    this.database.prepare(`
      INSERT INTO refresh_runs(run_id, source_label, fetched_at, input_checksum, record_count, status, error)
      VALUES (?, ?, ?, ?, 0, 'failed', ?)
      ON CONFLICT(run_id) DO NOTHING
    `).run(runId, requireString(sourceLabel, "sourceLabel", 200), checkedAt, checksum, safeError);
    return { runId };
  }

  private rebuildSearch() {
    this.database.exec("DELETE FROM work_search");
    this.database.exec(`
      INSERT INTO work_search(canonical_id, title, authors, search_terms)
      SELECT canonical_id, title, replace(replace(authors_json, '[', ''), ']', ''),
             replace(replace(search_terms_json, '[', ''), ']', '')
      FROM works
      ORDER BY canonical_id
    `);
  }

  search(query: string, options: { limit?: number; region?: RightsRegion } = {}): IndexSearchResult {
    const cleanQuery = query.normalize("NFKC").trim().slice(0, 500);
    const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 24)));
    const region = options.region ?? "GB";
    if (!["GB", "US", "GLOBAL"].includes(region)) throw new Error("Unsupported rights region.");
    const tokens = normaliseText(cleanQuery).split(" ").filter(Boolean).slice(0, 12);
    let rows: SqlRow[];
    let total = 0;
    if (tokens.length > 0) {
      const ftsQuery = tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(" AND ");
      rows = this.database.prepare(`
        SELECT w.*, bm25(work_search, 0.0, 5.0, 3.0, 1.0) AS raw_score
        FROM work_search JOIN works w ON w.canonical_id = work_search.canonical_id
        WHERE work_search MATCH ?
        ORDER BY raw_score ASC, w.title COLLATE NOCASE ASC, w.canonical_id ASC
        LIMIT ?
      `).all(ftsQuery, limit) as SqlRow[];
      const countRow = this.database.prepare("SELECT count(*) AS total FROM work_search WHERE work_search MATCH ?").get(ftsQuery) as SqlRow;
      total = Number(countRow.total ?? 0);
    } else {
      rows = this.database.prepare(`
        SELECT w.*, 0 AS raw_score FROM works w
        ORDER BY w.updated_at DESC, w.title COLLATE NOCASE ASC, w.canonical_id ASC LIMIT ?
      `).all(limit) as SqlRow[];
      const countRow = this.database.prepare("SELECT count(*) AS total FROM works").get() as SqlRow;
      total = Number(countRow.total ?? 0);
    }
    return {
      query: cleanQuery,
      region,
      total,
      books: rows.map((row) => this.hydrateBook(row, cleanQuery, tokens.length > 0)),
      explanation: tokens.length > 0
        ? "Results use local SQLite FTS5 BM25 over title, author and importer search terms. Stored source ranking remains visible on each work; rights context never changes text relevance."
        : "Results show the most recently refreshed indexed works. Rights context changes the explanation only, not availability claims.",
    };
  }

  private hydrateBook(row: SqlRow, query: string, matched: boolean): IndexedBook {
    const canonicalId = rowString(row, "canonical_id")!;
    const recordRows = this.database.prepare("SELECT * FROM source_records WHERE canonical_id = ? ORDER BY source, record_id").all(canonicalId) as SqlRow[];
    const sourceRecords: SourceRecord[] = recordRows.map((recordRow) => {
      const recordKey = rowString(recordRow, "record_key")!;
      const offerRows = this.database.prepare("SELECT * FROM offers WHERE record_key = ? AND active = 1 ORDER BY access, label, url").all(recordKey) as SqlRow[];
      const offers = offerRows.map((offerRow) => this.hydrateOffer(offerRow));
      return {
        source: rowString(recordRow, "source") as CatalogueSource,
        recordId: rowString(recordRow, "record_id")!,
        detailsUrl: rowString(recordRow, "details_url")!,
        ...(rowString(recordRow, "work_key") ? { workKey: rowString(recordRow, "work_key") } : {}),
        ...(rowString(recordRow, "language") ? { language: rowString(recordRow, "language") } : {}),
        ...(rowString(recordRow, "country") ? { country: rowString(recordRow, "country") } : {}),
        offers,
      };
    });
    const offers = sourceRecords.flatMap((record) => record.offers);
    const authors = parseJson<string[]>(rowString(row, "authors_json"), []);
    const title = rowString(row, "title")!;
    const rawScore = Number(row.raw_score ?? 0);
    const reasons = matched
      ? [
          normaliseText(title) === normaliseText(query) ? "Exact normalized title match." : "Title, author or indexed subject terms match.",
          `Ranked locally across ${sourceRecords.length} retained source record${sourceRecords.length === 1 ? "" : "s"}.`,
        ]
      : ["Recently refreshed indexed work."];
    const ranking = parseJson<WorkRanking | undefined>(rowString(row, "ranking_json"), undefined);
    const sourceRanks = ranking?.sourceRanks;
    const indexProvenance = recordRows.map((recordRow) => {
      const decision = this.database.prepare("SELECT * FROM merge_decisions WHERE record_key = ? AND canonical_id = ?")
        .get(rowString(recordRow, "record_key")!, canonicalId) as SqlRow | undefined;
      if (!decision) throw new Error(`Missing merge decision for ${rowString(recordRow, "record_key")}.`);
      return {
        source: rowString(recordRow, "source")!,
        recordId: rowString(recordRow, "record_id")!,
        fetchedAt: rowString(recordRow, "fetched_at")!,
        lastSeenAt: rowString(recordRow, "last_seen_at")!,
        merge: {
          method: rowString(decision, "method") as MergeMethod,
          confidence: rowString(decision, "confidence") as "exact" | "probable",
          algorithmVersion: rowString(decision, "algorithm_version")!,
          evidence: parseJson<string[]>(rowString(decision, "evidence_json"), []),
          decidedAt: rowString(decision, "decided_at")!,
        },
      };
    });
    return {
      id: canonicalId,
      canonicalId,
      canonicalUrl: rowString(row, "canonical_url"),
      title,
      authors,
      ...(row.year === null || row.year === undefined ? {} : { year: Number(row.year) }),
      ...(rowString(row, "cover") ? { cover: rowString(row, "cover") } : {}),
      source: [...new Set(sourceRecords.map((record) => record.source))].join(" + "),
      access: chooseAccess(offers),
      formats: offers.map(({ label, url }) => ({ label, url })),
      detailsUrl: sourceRecords[0]?.detailsUrl ?? rowString(row, "canonical_url")!,
      ...(sourceRecords.find((record) => record.workKey)?.workKey ? { workKey: sourceRecords.find((record) => record.workKey)?.workKey } : {}),
      ...(rowString(row, "language") ? { language: rowString(row, "language") } : {}),
      ...(rowString(row, "country") ? { country: rowString(row, "country") } : {}),
      clusterConfidence: rowString(row, "cluster_confidence") as "exact" | "probable",
      why: parseJson<string[]>(rowString(row, "why_json"), []),
      offers,
      sourceRecords,
      ...(sourceRanks ? { sourceRanks } : {}),
      ...(ranking ? { ranking } : {}),
      indexedAt: rowString(row, "snapshot_at")!,
      indexProvenance,
      indexRanking: {
        method: matched ? "sqlite-fts5-bm25-v1" : "recent-indexed-v1",
        score: matched ? Number((-rawScore).toFixed(8)) : 0,
        reasons,
      },
    };
  }

  private hydrateOffer(row: SqlRow): Offer {
    const status = rowString(row, "rights_status");
    const rights: Rights | undefined = status ? {
      status: status as Rights["status"],
      jurisdiction: rowString(row, "jurisdiction")!,
      note: rowString(row, "rights_note")!,
      ...(rowString(row, "licence_url") ? { licenceUrl: rowString(row, "licence_url") } : {}),
      ...(rowString(row, "applicability") ? { applicability: rowString(row, "applicability") as Rights["applicability"] } : {}),
    } : undefined;
    return {
      source: rowString(row, "source") as CatalogueSource,
      access: rowString(row, "access") as Access,
      label: rowString(row, "label")!,
      url: rowString(row, "url")!,
      ...(rowString(row, "format") ? { format: rowString(row, "format") } : {}),
      ...(rowString(row, "language") ? { language: rowString(row, "language") } : {}),
      ...(rights ? { rights } : {}),
    };
  }

  exportSnapshot(): ResolverIndexSnapshot {
    const rows = (table: string, order: string) => this.database.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all()
      .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? Number(value) : value]))) as Record<string, unknown>[];
    return {
      schemaVersion: INDEX_SCHEMA_VERSION,
      works: rows("works", "canonical_id"),
      sourceRecords: rows("source_records", "record_key"),
      offers: rows("offers", "offer_key"),
      mergeDecisions: rows("merge_decisions", "decision_key"),
      refreshRuns: rows("refresh_runs", "run_id"),
    };
  }

  stats() {
    const counts = this.database.prepare(`
      SELECT
        (SELECT count(*) FROM works) AS works,
        (SELECT count(*) FROM source_records) AS source_records,
        (SELECT count(*) FROM offers WHERE active = 1) AS active_offers,
        (SELECT count(*) FROM merge_decisions) AS merge_decisions,
        (SELECT max(fetched_at) FROM refresh_runs WHERE status = 'complete') AS latest_refresh
    `).get() as SqlRow;
    return {
      schemaVersion: INDEX_SCHEMA_VERSION,
      works: Number(counts.works ?? 0),
      sourceRecords: Number(counts.source_records ?? 0),
      activeOffers: Number(counts.active_offers ?? 0),
      mergeDecisions: Number(counts.merge_decisions ?? 0),
      latestRefresh: rowString(counts, "latest_refresh") ?? null,
    };
  }

  exportJson() {
    return `${stableJson(this.exportSnapshot())}\n`;
  }

  exportCsv() {
    const snapshot = this.exportSnapshot();
    return {
      "works.csv": rowsToCsv(snapshot.works),
      "source-records.csv": rowsToCsv(snapshot.sourceRecords),
      "offers.csv": rowsToCsv(snapshot.offers),
      "merge-decisions.csv": rowsToCsv(snapshot.mergeDecisions),
      "refresh-runs.csv": rowsToCsv(snapshot.refreshRuns),
    };
  }
}

export const resolverMigrationPath = fileURLToPath(MIGRATION_URL);
