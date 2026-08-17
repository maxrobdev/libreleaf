import type { NormalisedBook, RightsRegion } from "../sources/types.ts";

export const INDEX_SCHEMA_VERSION = 1 as const;

export type MergeMethod =
  | "single-source"
  | "source-work-key"
  | "shared-identifier"
  | "exact-title-primary-author"
  | "resolver-exact-cluster";

export type ResolverIndexEntry = {
  schemaVersion: typeof INDEX_SCHEMA_VERSION;
  fetchedAt: string;
  searchTerms?: string[];
  merge: {
    method: MergeMethod;
    algorithmVersion: string;
    evidence: string[];
  };
  work: NormalisedBook;
};

export type IndexedBook = NormalisedBook & {
  indexedAt: string;
  indexProvenance: Array<{
    source: string;
    recordId: string;
    fetchedAt: string;
    lastSeenAt: string;
    merge: {
      method: MergeMethod;
      confidence: "exact" | "probable";
      algorithmVersion: string;
      evidence: string[];
      decidedAt: string;
    };
  }>;
  indexRanking: {
    method: "sqlite-fts5-bm25-v1" | "recent-indexed-v1";
    score: number;
    reasons: string[];
  };
};

export type IndexSearchResult = {
  query: string;
  region: RightsRegion;
  total: number;
  books: IndexedBook[];
  explanation: string;
};

export type ResolverIndexSnapshot = {
  schemaVersion: typeof INDEX_SCHEMA_VERSION;
  works: Record<string, unknown>[];
  sourceRecords: Record<string, unknown>[];
  offers: Record<string, unknown>[];
  mergeDecisions: Record<string, unknown>[];
  refreshRuns: Record<string, unknown>[];
};
