import type { NormalisedBook } from "../../sources/types.ts";
import { INDEX_SCHEMA_VERSION, type ResolverIndexEntry } from "../types.ts";
import { validateIndexEntry } from "../database.ts";

const EXPECTED_COLUMNS = ["Text#", "Type", "Issued", "Title", "Language", "Authors", "Subjects", "LoCC", "Bookshelves"] as const;
const MAX_CSV_BYTES = 64 * 1024 * 1024;
const MAX_ROWS = 250_000;

export type GutenbergCsvReport = {
  schemaVersion: 1;
  importer: "project-gutenberg-weekly-csv-v1";
  sourceUrl: "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";
  fetchedAt: string;
  rowsRead: number;
  textRecords: number;
  skippedNonText: number;
  firstRecordId: string | null;
  lastRecordId: string | null;
  complete: boolean;
  notes: string[];
};

function* csvRows(text: string): Generator<string[]> {
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.length > 0)) yield row;
      row = [];
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Project Gutenberg CSV ended inside a quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) yield row;
  }
}

function isoDate(value: string) {
  if (Number.isNaN(Date.parse(value))) throw new Error("Gutenberg fetchedAt must be an ISO timestamp.");
  return new Date(value).toISOString();
}

function values(value: string, maximum: number) {
  return [...new Set(value.split(/\s*;\s*/).map((item) => item.normalize("NFKC").trim()).filter(Boolean))].slice(0, maximum);
}

function gutenbergPerson(value: string) {
  return value
    .replace(/\s+\[[^\]]+\]\s*$/u, "")
    .replace(/,\s*(?:active\s+)?\d{1,4}(?:\?)?(?:st|nd|rd|th)?(?:\s+BCE|\s+century)?(?:\s*-\s*(?:\d{1,4}(?:\?)?(?:\s+BCE)?|present))?\s*$/iu, "")
    .trim();
}

function entryForRow(row: string[], fetchedAt: string): ResolverIndexEntry | null {
  if (row.length !== EXPECTED_COLUMNS.length) throw new Error(`Project Gutenberg CSV row has ${row.length} columns; expected ${EXPECTED_COLUMNS.length}.`);
  const [recordId, type, , rawTitle, rawLanguage, rawAuthors, rawSubjects, rawLocc, rawBookshelves] = row;
  if (type !== "Text") return null;
  if (!/^\d{1,9}$/.test(recordId!)) throw new Error("Project Gutenberg CSV contains an invalid Text# value.");
  const title = rawTitle!.normalize("NFKC").replace(/\s*\n\s*/g, ": ").trim();
  if (!title) throw new Error(`Project Gutenberg record ${recordId} has no title.`);
  const authors = values(rawAuthors!, 32).map(gutenbergPerson).filter(Boolean);
  const languages = values(rawLanguage!, 16);
  const subjects = values(rawSubjects!, 64);
  const bookshelves = values(rawBookshelves!, 64);
  const classifications = values(rawLocc!, 32);
  const detailsUrl = `https://www.gutenberg.org/ebooks/${recordId}`;
  const sourceRecord = {
    source: "Project Gutenberg" as const,
    recordId: recordId!,
    detailsUrl,
    workKey: `pg:${recordId}`,
    ...(languages[0] ? { language: languages[0] } : {}),
    country: "US",
    offers: [],
  };
  const work: NormalisedBook = {
    id: `pg:${recordId}`,
    title,
    authors,
    source: "Project Gutenberg",
    access: "read",
    formats: [],
    detailsUrl,
    ...(languages[0] ? { language: languages[0] } : {}),
    country: "US",
    clusterConfidence: "exact",
    why: [
      "Indexed from Project Gutenberg's official weekly metadata CSV.",
      "Access formats and copyright status require a current source refresh.",
    ],
    offers: [],
    sourceRecords: [sourceRecord],
  };
  return validateIndexEntry({
    schemaVersion: INDEX_SCHEMA_VERSION,
    fetchedAt,
    searchTerms: [...subjects, ...bookshelves, ...classifications, ...languages].slice(0, 128),
    merge: {
      method: "single-source",
      algorithmVersion: "project-gutenberg-weekly-csv-v1",
      evidence: [`Official Project Gutenberg CSV record Text# ${recordId}; no cross-source merge performed.`],
    },
    work,
  });
}

export function* generateGutenbergCsvEntries(
  csv: string,
  options: { fetchedAt: string; maxRecords?: number },
): Generator<ResolverIndexEntry, GutenbergCsvReport> {
  if (Buffer.byteLength(csv) > MAX_CSV_BYTES) throw new Error("Project Gutenberg CSV exceeds 64 MiB.");
  const fetchedAt = isoDate(options.fetchedAt);
  const maxRecords = options.maxRecords === undefined ? Number.POSITIVE_INFINITY : Math.max(1, Math.min(MAX_ROWS, Math.trunc(options.maxRecords)));
  const iterator = csvRows(csv);
  const header = iterator.next();
  if (header.done) throw new Error("Project Gutenberg CSV is empty.");
  const columns = header.value.map((column, index) => index === 0 ? column.replace(/^\uFEFF/, "") : column);
  if (columns.length !== EXPECTED_COLUMNS.length || columns.some((column, index) => column !== EXPECTED_COLUMNS[index])) {
    throw new Error(`Unexpected Project Gutenberg CSV header: ${columns.join(", ")}`);
  }
  const seen = new Set<string>();
  let rowsRead = 0;
  let textRecords = 0;
  let skippedNonText = 0;
  let firstRecordId: string | null = null;
  let lastRecordId: string | null = null;
  let complete = true;
  for (let next = iterator.next(); !next.done; next = iterator.next()) {
    rowsRead += 1;
    if (rowsRead > MAX_ROWS) throw new Error(`Project Gutenberg CSV exceeds ${MAX_ROWS} data rows.`);
    const entry = entryForRow(next.value, fetchedAt);
    if (!entry) {
      skippedNonText += 1;
      continue;
    }
    const recordId = entry.work.sourceRecords[0]!.recordId;
    if (seen.has(recordId)) throw new Error(`Duplicate Project Gutenberg Text# ${recordId}.`);
    seen.add(recordId);
    firstRecordId ??= recordId;
    lastRecordId = recordId;
    textRecords += 1;
    yield entry;
    if (textRecords >= maxRecords) {
      complete = false;
      break;
    }
  }
  return {
    schemaVersion: 1,
    importer: "project-gutenberg-weekly-csv-v1",
    sourceUrl: "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv",
    fetchedAt,
    rowsRead,
    textRecords,
    skippedNonText,
    firstRecordId,
    lastRecordId,
    complete,
    notes: [
      "Issued is Project Gutenberg's ebook release date and is not imported as the original publication year.",
      "The weekly CSV contains metadata, not verified current format URLs; access offers remain empty until a source refresh.",
      "Project Gutenberg's public-domain assessment is United States-specific and is not inferred from CSV membership.",
    ],
  };
}
