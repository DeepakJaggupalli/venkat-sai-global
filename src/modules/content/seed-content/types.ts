import type { CmsCollection, CmsSeo } from "@/db/schema";

/**
 * A CMS entry created by the production seed (insert-only: an existing entry with the same collection, slug and
 * language — including one in the bin — is never touched).
 */
export type SeedEntrySpec = {
  collection: CmsCollection;
  slug: string;
  title: string;
  summary?: string;
  data: Record<string, unknown>;
  seo?: CmsSeo;
  tags?: string[];
  sortOrder?: number;
  /** Featured entry (services: shown first as a main service on /services). */
  isFeatured?: boolean;
  /** Publish version 1 (only for factual, claim-free content). */
  publish: boolean;
  /** Version note shown in the history. */
  note: string;
  /** Unpublished versions saved on top of version 1 (clearly editable drafts awaiting review). */
  draftVersions?: { data: Record<string, unknown>; note: string; title?: string; summary?: string }[];
};

/** Lookups available to seed builders (resolved from reference data and earlier seeded entries). */
export type SeedLookups = {
  industryIdBySlug: ReadonlyMap<string, string>;
  languageCodes: ReadonlySet<string>;
  serviceIdBySlug: ReadonlyMap<string, string>;
};
