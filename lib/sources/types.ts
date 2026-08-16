export type SearchMode = "q" | "title" | "author" | "subject";

export type RightsRegion = "GB" | "US" | "GLOBAL";

export type Access = "download" | "borrow" | "preview" | "read" | "listen";

export type CatalogueSource =
  | "Project Gutenberg"
  | "Open Library"
  | "Wikisource"
  | "DOAB"
  | "Library of Congress";

export type Rights = {
  status:
    | "source-assessed-public-domain"
    | "open-licence"
    | "source-policy-free"
    | "source-provided-access";
  jurisdiction: string;
  note: string;
  licenceUrl?: string;
  applicability?: "verified" | "source-jurisdiction-only" | "check-local";
};

export type Offer = {
  source: CatalogueSource;
  access: Access;
  label: string;
  url: string;
  format?: string;
  language?: string;
  rights?: Rights;
};

export type SourceRecord = {
  source: CatalogueSource;
  recordId: string;
  detailsUrl: string;
  workKey?: string;
  language?: string;
  country?: string;
  offers: Offer[];
};

export type NormalisedBook = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  cover?: string;
  source: string;
  access: Access;
  formats: { label: string; url: string }[];
  detailsUrl: string;
  workKey?: string;
  language?: string;
  country?: string;
  clusterConfidence: "exact" | "probable";
  why: string[];
  offers: Offer[];
  sourceRecords: SourceRecord[];
};

export type SourcePage = {
  books: NormalisedBook[];
  total: number | null;
  hasMore: boolean;
  advanceBy: number;
};

export type SourceSearch = {
  query: string;
  by: SearchMode;
  offset: number;
  region: RightsRegion;
};

export type SourceFetch = (url: string, userAgent?: string, timeout?: number) => Promise<unknown>;

export type SourceAdapter = {
  source: CatalogueSource;
  search: (input: SourceSearch, fetchJson: SourceFetch) => Promise<SourcePage>;
};
