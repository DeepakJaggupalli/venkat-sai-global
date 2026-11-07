/**
 * Plain-JSON props passed from the Command Centre pages to the CMS client components.
 */
import type { CmsCollection, CmsEntryStatus, ContentConsentStatus } from "@/db/schema";
import type { CmsSeo } from "@/modules/content/types";
import type { FileSummary } from "@/modules/files/types";

export type EditorEntry = {
  id: string;
  collection: CmsCollection;
  locale: string;
  status: CmsEntryStatus;
  currentVersion: number;
  publishedVersion: number | null;
  scheduledVersion: number | null;
  publishAt: string | null;
  unpublishAt: string | null;
  publishedAt: string | null;
  isFeatured: boolean;
  deleted: boolean;
  updatedAt: string;
  consentStatus: ContentConsentStatus;
};

export type EditorContent = {
  version: number;
  slug: string;
  title: string;
  summary: string | null;
  data: Record<string, unknown>;
  seo: CmsSeo;
  tags: string[];
  heroAssetId: string | null;
};

export type EditorVersion = {
  version: number;
  title: string;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  isCurrent: boolean;
  isPublished: boolean;
  isScheduled: boolean;
};

export type EditorApproval = { id: string; code: string; type: string; status: string; createdAt: string; decisionReason: string | null };

export type EditorCapabilities = { edit: boolean; publish: boolean; upload: boolean };

export type ConsentState = {
  status: ContentConsentStatus;
  notes: string | null;
  obtainedAt: string | null;
  expiresAt: string | null;
  file: FileSummary | null;
};

/** Date → "YYYY-MM-DD" (UTC) for date inputs; null stays null. */
export function toCalendarDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
