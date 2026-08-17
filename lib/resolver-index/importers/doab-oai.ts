import { createHash } from "node:crypto";
import type { NormalisedBook, Offer, Rights } from "../../sources/types.ts";
import { validateIndexEntry } from "../database.ts";
import { INDEX_SCHEMA_VERSION, type ResolverIndexEntry } from "../types.ts";

export const DOAB_OAI_ENDPOINT = "https://directory.doabooks.org/oai/request";
export const DOAB_METADATA_LICENCE = "https://creativecommons.org/publicdomain/zero/1.0/";

const USER_AGENT = "LibreLeaf resolver-index/0.1 (+https://github.com/maxrobdev/libreleaf)";
const MAX_XML_BYTES = 32 * 1024 * 1024;
const MAX_RECORDS_PER_PAGE = 2_000;
const MAX_HARVEST_RECORDS = 100_000;
const MAX_HARVEST_PAGES = 10_000;

type XoaiField = {
  path: string[];
  name: string;
  value: string;
};

type ParsedRecord = {
  identifier: string;
  datestamp: string;
  deleted: boolean;
  fields: XoaiField[];
};

export type DoabOaiPageReport = {
  recordsSeen: number;
  recordsImported: number;
  recordsDeleted: number;
  recordsSkipped: number;
  responseDate: string;
  completeListSize: number | null;
  nextResumptionToken: string | null;
};

export type DoabOaiPage = {
  entries: ResolverIndexEntry[];
  identifiers: string[];
  report: DoabOaiPageReport;
};

export type DoabOaiHarvestReport = {
  schemaVersion: 1;
  importer: "doab-oai-pmh-xoai-v1";
  sourceUrl: typeof DOAB_OAI_ENDPOINT;
  metadataLicence: typeof DOAB_METADATA_LICENCE;
  fetchedAt: string;
  from: string | null;
  until: string;
  pagesFetched: number;
  recordsSeen: number;
  recordsImported: number;
  recordsDeleted: number;
  recordsSkipped: number;
  completeListSize: number | null;
  firstIdentifier: string | null;
  lastIdentifier: string | null;
  lastResponseDate: string | null;
  pageChecksums: string[];
  complete: boolean;
  nextResumptionToken: string | null;
  notes: string[];
};

type HarvestOptions = {
  fetchedAt: string;
  until: string;
  from?: string;
  maxPages?: number;
  fetcher?: typeof fetch;
  onPage?: (page: DoabOaiPage, xml: string, pageNumber: number) => void | Promise<void>;
};

function decodeXml(value: string) {
  return value.replace(/&#(?:x([0-9a-f]+)|([0-9]+));|&(amp|lt|gt|quot|apos);/giu, (entity, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    return named === "amp" ? "&" : named === "lt" ? "<" : named === "gt" ? ">" : named === "quot" ? '"' : "'";
  });
}

function cleanText(value: string, maximum = 4_000) {
  return decodeXml(value).normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, maximum);
}

function xmlAttribute(attributes: string, name: string) {
  const expression = new RegExp(`(?:^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "iu");
  const match = expression.exec(attributes);
  return match ? cleanText(match[2] ?? "", 2_000) : undefined;
}

function firstTagText(xml: string, name: string) {
  const expression = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${name}\\s*>`, "iu");
  const match = expression.exec(xml);
  return match ? cleanText(match[1] ?? "") : undefined;
}

function isoTimestamp(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO 8601 UTC timestamp.`);
  }
  return new Date(value).toISOString();
}

function oaiBoundary(value: string, label: string) {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  return isoTimestamp(value, label).replace(/\.000Z$/u, "Z");
}

function safeUrl(value: string | undefined, allowedHosts?: readonly string[]) {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.username || url.password) return undefined;
    if (url.protocol === "http:" && allowedHosts?.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      url.protocol = "https:";
    }
    if (url.protocol !== "https:") return undefined;
    if (allowedHosts && !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseXoaiFields(xml: string) {
  const fields: XoaiField[] = [];
  const path: string[] = [];
  const tokens = /<(?:[A-Za-z_][\w.-]*:)?element\b([^>]*)>|<\/(?:[A-Za-z_][\w.-]*:)?element\s*>|<(?:[A-Za-z_][\w.-]*:)?field\b([^>]*)\/>|<(?:[A-Za-z_][\w.-]*:)?field\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?field\s*>/giu;
  for (const match of xml.matchAll(tokens)) {
    if (match[1] !== undefined) {
      const name = xmlAttribute(match[1], "name");
      if (!name) throw new Error("DOAB XOAI element is missing its name.");
      if (!match[1].trimEnd().endsWith("/")) path.push(name);
    } else if (match[2] !== undefined) {
      const name = xmlAttribute(match[2], "name");
      if (!name) throw new Error("DOAB XOAI empty field is missing its name.");
    } else if (match[3] !== undefined) {
      const name = xmlAttribute(match[3], "name");
      if (!name) throw new Error("DOAB XOAI field is missing its name.");
      const value = cleanText(match[4] ?? "");
      if (value) fields.push({ path: [...path], name, value });
    } else {
      if (path.length === 0) throw new Error(`DOAB XOAI contains an unmatched closing element near byte ${match.index}.`);
      path.pop();
    }
  }
  if (path.length !== 0) throw new Error("DOAB XOAI contains an unclosed element.");
  return fields;
}

function parseRecords(xml: string) {
  const records: ParsedRecord[] = [];
  const expression = /<(?:[A-Za-z_][\w.-]*:)?record\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?record\s*>/giu;
  for (const match of xml.matchAll(expression)) {
    if (records.length >= MAX_RECORDS_PER_PAGE) throw new Error(`DOAB OAI page exceeds ${MAX_RECORDS_PER_PAGE} records.`);
    const body = match[1] ?? "";
    const headerMatch = /<(?:[A-Za-z_][\w.-]*:)?header\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?header\s*>/iu.exec(body);
    if (!headerMatch) throw new Error("DOAB OAI record has no header.");
    const identifier = firstTagText(headerMatch[2] ?? "", "identifier");
    const datestamp = firstTagText(headerMatch[2] ?? "", "datestamp");
    if (!identifier || !datestamp) throw new Error("DOAB OAI record header is incomplete.");
    const deleted = xmlAttribute(headerMatch[1] ?? "", "status") === "deleted";
    let fields: XoaiField[] = [];
    if (!deleted) {
      try {
        fields = parseXoaiFields(body);
      } catch (error) {
        throw new Error(`DOAB OAI record ${identifier} is invalid: ${error instanceof Error ? error.message : "invalid XOAI metadata"}`);
      }
    }
    records.push({
      identifier,
      datestamp: oaiBoundary(datestamp, `DOAB record ${identifier} datestamp`),
      deleted,
      fields,
    });
  }
  return records;
}

function fieldValues(fields: XoaiField[], predicate: (field: XoaiField) => boolean, maximum = 128) {
  return [...new Set(fields.filter(predicate).map((field) => field.value).filter(Boolean))].slice(0, maximum);
}

function pathEnds(field: XoaiField, values: readonly string[]) {
  const path = field.path.map((part) => part.toLocaleLowerCase("en-GB"));
  const expected = values.map((part) => part.toLocaleLowerCase("en-GB"));
  return expected.every((part, index) => path[path.length - expected.length + index] === part);
}

function isValueField(field: XoaiField) {
  return field.name.toLocaleLowerCase("en-GB") === "value";
}

function normaliseDoi(value: string | undefined) {
  if (!value) return undefined;
  const doi = value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "").replace(/^doi:\s*/iu, "").trim();
  return /^10\.\d{4,9}\/[\w.()/:;-]+$/iu.test(doi) ? doi.toLocaleLowerCase("en-GB") : undefined;
}

function handleFrom(identifier: string, fields: XoaiField[]) {
  const candidates = [identifier, ...fieldValues(fields, (field) => field.name.toLocaleLowerCase("en-GB") === "handle", 8)];
  for (const candidate of candidates) {
    const match = /20\.500\.12854\/[A-Za-z0-9._~-]+/u.exec(candidate);
    if (match) return match[0];
  }
  return undefined;
}

function directFormat(url: string) {
  const pathname = new URL(url).pathname.toLocaleLowerCase("en-GB");
  if (pathname.endsWith(".pdf")) return "PDF";
  if (pathname.endsWith(".epub")) return "EPUB";
  return undefined;
}

function entryForRecord(record: ParsedRecord, fetchedAt: string): ResolverIndexEntry | null {
  if (record.deleted) return null;
  const fields = record.fields;
  const types = fieldValues(fields, (field) => isValueField(field) && pathEnds(field, ["dc", "type", "none"]));
  if (!types.some((value) => /\b(?:book|monograph)\b/iu.test(value))) return null;
  const title = fieldValues(fields, (field) => isValueField(field) && pathEnds(field, ["dc", "title", "none"]), 1)[0]?.slice(0, 1_000);
  const handle = handleFrom(record.identifier, fields);
  if (!title || !handle) return null;

  const detailsUrl = `https://directory.doabooks.org/handle/${handle}`;
  const authors = fieldValues(fields, (field) => isValueField(field) && pathEnds(field, ["dc", "contributor", "author", "none"]), 32).map((value) => value.slice(0, 500));
  const languages = fieldValues(fields, (field) => isValueField(field) && pathEnds(field, ["dc", "language", "none"]), 16).map((value) => value.slice(0, 100));
  const subjects = fieldValues(fields, (field) => isValueField(field) && field.path.some((part) => part.toLocaleLowerCase("en-GB") === "subject"), 64);
  const subtitles = fieldValues(fields, (field) => isValueField(field) && pathEnds(field, ["dc", "title", "alternative", "none"]), 8);
  const publishers = fieldValues(fields, (field) => isValueField(field) && (field.path.some((part) => part.toLocaleLowerCase("en-GB") === "publisher.name") || pathEnds(field, ["oapen", "imprint", "none"])), 16);
  const isbns = fieldValues(fields, (field) => isValueField(field) && field.path.some((part) => part.toLocaleLowerCase("en-GB") === "isbn"), 16);
  const doi = normaliseDoi(fieldValues(fields, (field) => isValueField(field) && field.path.some((part) => part.toLocaleLowerCase("en-GB") === "doi"), 4)[0]);
  const yearValue = fieldValues(fields, (field) => isValueField(field) && pathEnds(field, ["dc", "date", "issued", "none"]), 1)[0]?.match(/\b(1\d{3}|20\d{2})\b/u)?.[0];
  const year = yearValue ? Number(yearValue) : undefined;
  const country = fieldValues(fields, (field) => isValueField(field) && field.path.some((part) => part.toLocaleLowerCase("en-GB") === "publisher.country"), 1)[0]?.slice(0, 100);
  const licenceUrl = fieldValues(fields, (field) => {
    const name = field.name.toLocaleLowerCase("en-GB");
    return name === "rightsuri" || (name === "value" && field.path.some((part) => /rights?/iu.test(part)) && field.path.some((part) => part.toLocaleLowerCase("en-GB") === "uri"));
  }, 8).map((value) => safeUrl(value)).find(Boolean);
  const rights: Rights = licenceUrl ? {
    status: "open-licence",
    jurisdiction: country ? `Publisher country: ${country}` : "Publisher-supplied open licence",
    note: "DOAB supplied this edition's licence URL. The linked licence conditions apply to the book; local law may still affect material incorporated in it.",
    licenceUrl,
    applicability: "check-local",
  } : {
    status: "source-provided-access",
    jurisdiction: country ? `Publisher country: ${country}` : "Publisher-supplied open-access record",
    note: "DOAB lists this edition as open access but this record did not supply a machine-readable licence URL. Check the source record before reuse.",
    applicability: "check-local",
  };

  const downloadUrls = fieldValues(fields, (field) => field.name.toLocaleLowerCase("en-GB").includes("downloadurl"), 16)
    .map((value) => safeUrl(value, ["oapen.org", "doabooks.org"]))
    .filter((value): value is string => Boolean(value))
    .map((url) => ({ url, format: directFormat(url) }))
    .filter((route): route is { url: string; format: string } => Boolean(route.format));
  const offers: Offer[] = downloadUrls.length > 0
    ? downloadUrls.slice(0, 8).map(({ url, format }) => ({
        source: "DOAB",
        access: "download",
        label: `Download ${format}`,
        url,
        format,
        ...(languages[0] ? { language: languages[0] } : {}),
        rights,
      }))
    : [{
        source: "DOAB",
        access: "read",
        label: "Open-access edition",
        url: detailsUrl,
        ...(languages[0] ? { language: languages[0] } : {}),
        rights,
      }];
  const workKey = doi ? `doi:${doi}` : `doab:${handle}`;
  const sourceRecord = {
    source: "DOAB" as const,
    recordId: handle,
    detailsUrl,
    workKey,
    ...(languages[0] ? { language: languages[0] } : {}),
    ...(country ? { country } : {}),
    offers,
  };
  const work: NormalisedBook = {
    id: `doab:${handle}`,
    title,
    authors,
    ...(year ? { year } : {}),
    source: "DOAB",
    access: offers[0]?.access ?? "read",
    formats: offers.filter((offer) => offer.access === "download").map((offer) => ({ label: offer.format ?? offer.label, url: offer.url })),
    detailsUrl,
    workKey,
    ...(languages[0] ? { language: languages[0] } : {}),
    ...(country ? { country } : {}),
    clusterConfidence: "exact",
    why: [
      "Indexed from DOAB's official OAI-PMH XOAI metadata feed.",
      licenceUrl ? "The source supplied an edition-specific licence URL." : "The source supplied access but no machine-readable licence URL; reuse terms need checking.",
    ],
    offers,
    sourceRecords: [sourceRecord],
  };
  const searchTerms = [...new Set([...subjects, ...subtitles, ...publishers, ...isbns, ...(doi ? [doi] : []), ...languages, ...types]
    .map((value) => value.slice(0, 500))
    .filter(Boolean))].slice(0, 128);
  return validateIndexEntry({
    schemaVersion: INDEX_SCHEMA_VERSION,
    fetchedAt,
    searchTerms,
    merge: {
      method: "single-source",
      algorithmVersion: "doab-oai-pmh-xoai-v1",
      evidence: [
        `Official DOAB OAI-PMH record ${record.identifier}, source datestamp ${record.datestamp}; no cross-source merge performed.`,
        ...(doi ? [`Publisher-supplied DOI ${doi} retained as a work key.`] : []),
      ],
    },
    work,
  });
}

function resumption(xml: string) {
  const paired = /<(?:[A-Za-z_][\w.-]*:)?resumptionToken\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?resumptionToken\s*>/iu.exec(xml);
  const empty = paired ? undefined : /<(?:[A-Za-z_][\w.-]*:)?resumptionToken\b([^>]*)\/>/iu.exec(xml);
  const attributes = paired?.[1] ?? empty?.[1] ?? "";
  const token = paired ? cleanText(paired[2] ?? "", 16_000) : "";
  const sizeValue = xmlAttribute(attributes, "completeListSize");
  const completeListSize = sizeValue && /^\d+$/u.test(sizeValue) ? Number(sizeValue) : null;
  return { token: token || null, completeListSize };
}

function oaiError(xml: string) {
  const match = /<(?:[A-Za-z_][\w.-]*:)?error\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?error\s*>/iu.exec(xml);
  if (!match) return undefined;
  return { code: xmlAttribute(match[1] ?? "", "code") ?? "unknown", message: cleanText(match[2] ?? "") };
}

export function parseDoabOaiPage(xml: string, options: { fetchedAt: string }): DoabOaiPage {
  if (Buffer.byteLength(xml) > MAX_XML_BYTES) throw new Error("DOAB OAI page exceeds 32 MiB.");
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new Error("DOAB OAI page must not contain a DTD or entity declaration.");
  const fetchedAt = isoTimestamp(options.fetchedAt, "DOAB fetchedAt");
  const responseDateValue = firstTagText(xml, "responseDate");
  if (!responseDateValue) throw new Error("DOAB OAI page has no responseDate.");
  const responseDate = isoTimestamp(responseDateValue, "DOAB responseDate");
  const error = oaiError(xml);
  if (error && error.code !== "noRecordsMatch") throw new Error(`DOAB OAI error ${error.code}: ${error.message || "request failed"}`);
  const records = error?.code === "noRecordsMatch" ? [] : parseRecords(xml);
  const identifiers = records.map((record) => record.identifier);
  if (new Set(identifiers).size !== identifiers.length) throw new Error("DOAB OAI page contains duplicate record identifiers.");
  const entries = records.flatMap((record) => {
    const entry = entryForRecord(record, fetchedAt);
    return entry ? [entry] : [];
  });
  const deleted = records.filter((record) => record.deleted).length;
  const continuation = resumption(xml);
  return {
    entries,
    identifiers,
    report: {
      recordsSeen: records.length,
      recordsImported: entries.length,
      recordsDeleted: deleted,
      recordsSkipped: records.length - entries.length - deleted,
      responseDate,
      completeListSize: continuation.completeListSize,
      nextResumptionToken: continuation.token,
    },
  };
}

async function boundedXml(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > MAX_XML_BYTES) {
      await reader.cancel();
      throw new Error("DOAB OAI response exceeds 32 MiB.");
    }
    chunks.push(next.value);
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}

async function fetchOaiXml(url: URL, fetcher: typeof fetch) {
  const response = await fetcher(url, {
    headers: { accept: "application/xml, text/xml;q=0.9", "user-agent": USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status >= 300 && response.status < 400) throw new Error("DOAB OAI endpoint returned an unexpected redirect.");
  if (!response.ok) throw new Error(`DOAB OAI request failed with HTTP ${response.status}.`);
  return boundedXml(response);
}

export async function harvestDoabOai(options: HarvestOptions): Promise<DoabOaiHarvestReport> {
  const fetchedAt = isoTimestamp(options.fetchedAt, "DOAB fetchedAt");
  const from = options.from ? oaiBoundary(options.from, "DOAB from") : undefined;
  const until = oaiBoundary(options.until, "DOAB until");
  if (from && Date.parse(from) > Date.parse(until)) throw new Error("DOAB from must not be later than until.");
  const maxPages = Math.max(1, Math.min(MAX_HARVEST_PAGES, Math.trunc(options.maxPages ?? MAX_HARVEST_PAGES)));
  const fetcher = options.fetcher ?? fetch;
  const seenIdentifiers = new Set<string>();
  const seenTokens = new Set<string>();
  const pageChecksums: string[] = [];
  let token: string | null = null;
  let pagesFetched = 0;
  let recordsSeen = 0;
  let recordsImported = 0;
  let recordsDeleted = 0;
  let recordsSkipped = 0;
  let completeListSize: number | null = null;
  let firstIdentifier: string | null = null;
  let lastIdentifier: string | null = null;
  let lastResponseDate: string | null = null;

  do {
    const url = new URL(DOAB_OAI_ENDPOINT);
    url.searchParams.set("verb", "ListRecords");
    if (token) {
      if (seenTokens.has(token)) throw new Error("DOAB OAI repeated a resumption token.");
      seenTokens.add(token);
      url.searchParams.set("resumptionToken", token);
    } else {
      url.searchParams.set("metadataPrefix", "xoai");
      if (from) url.searchParams.set("from", from);
      url.searchParams.set("until", until);
    }
    const xml = await fetchOaiXml(url, fetcher);
    const page = parseDoabOaiPage(xml, { fetchedAt });
    pagesFetched += 1;
    for (const identifier of page.identifiers) {
      if (seenIdentifiers.has(identifier)) throw new Error(`DOAB OAI repeated record ${identifier}.`);
      seenIdentifiers.add(identifier);
      firstIdentifier ??= identifier;
      lastIdentifier = identifier;
    }
    recordsSeen += page.report.recordsSeen;
    recordsImported += page.report.recordsImported;
    recordsDeleted += page.report.recordsDeleted;
    recordsSkipped += page.report.recordsSkipped;
    if (recordsSeen > MAX_HARVEST_RECORDS) throw new Error(`DOAB harvest exceeds ${MAX_HARVEST_RECORDS} records.`);
    completeListSize ??= page.report.completeListSize;
    lastResponseDate = page.report.responseDate;
    pageChecksums.push(createHash("sha256").update(xml).digest("hex"));
    await options.onPage?.(page, xml, pagesFetched);
    token = page.report.nextResumptionToken;
  } while (token && pagesFetched < maxPages);

  return {
    schemaVersion: 1,
    importer: "doab-oai-pmh-xoai-v1",
    sourceUrl: DOAB_OAI_ENDPOINT,
    metadataLicence: DOAB_METADATA_LICENCE,
    fetchedAt,
    from: from ?? null,
    until,
    pagesFetched,
    recordsSeen,
    recordsImported,
    recordsDeleted,
    recordsSkipped,
    completeListSize,
    firstIdentifier,
    lastIdentifier,
    lastResponseDate,
    pageChecksums,
    complete: token === null,
    nextResumptionToken: token,
    notes: [
      "DOAB states that its metadata feeds are CC0 1.0; this does not determine the licence of each book.",
      "Each access offer retains the record's publisher-supplied licence URL when present; otherwise reuse remains explicitly unassessed.",
      "Deleted OAI-PMH headers are counted but do not remove indexed records until LibreLeaf has a reviewed tombstone policy.",
      "Resumption tokens are opaque flow-control values and are never parsed or used as stable identifiers.",
    ],
  };
}
