/**
 * Pure rules of the CMS versioning and publication model (client-safe, unit-tested).
 *
 *  - Every save appends a version (currentVersion + 1). Until an entry is live, the cms_entries row mirrors the
 *    latest version; while it is live, the row holds exactly the published version and newer versions wait in
 *    cms_entry_versions (currentVersion > publishedVersion = unpublished changes).
 *  - Publishing copies a version onto the row (publishedVersion = that version). Scheduling pins a version
 *    (scheduledVersion) to go live at publishAt, so later edits are never published unreviewed.
 *  - Unpublishing or archiving takes the entry offline: publishedVersion becomes null and the row mirrors the
 *    latest version again. Rollback copies an old version into a NEW version (history is append-only).
 */
import type { CmsEntryStatus, ContentConsentStatus } from "@/db/schema";

import type { FieldDescriptor, FieldMap } from "./fields";
import { stableStringify } from "./field-walk";
import type { CmsSeo, FieldChange } from "./types";

export type VersionState = {
  status: CmsEntryStatus;
  currentVersion: number;
  publishedVersion: number | null;
  scheduledVersion: number | null;
  publishAt: Date | null;
  unpublishAt: Date | null;
  deletedAt?: Date | null;
};

/** Saved changes that are not live yet (always true for an entry that is not live). */
export function hasUnpublishedChanges(state: Pick<VersionState, "currentVersion" | "publishedVersion">): boolean {
  return state.publishedVersion === null || state.currentVersion > state.publishedVersion;
}

/** Whether the row mirrors the latest version on save (nothing is live). */
export function rowMirrorsLatest(state: Pick<VersionState, "publishedVersion">): boolean {
  return state.publishedVersion === null;
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

const ok: TransitionCheck = { ok: true };
const no = (reason: string): TransitionCheck => ({ ok: false, reason });

export function canEdit(state: VersionState): TransitionCheck {
  if (state.deletedAt) return no("This entry is in the bin. Restore it before editing.");
  return ok;
}

export function canPublish(state: VersionState, version: number): TransitionCheck {
  if (state.deletedAt) return no("This entry is in the bin. Restore it first.");
  if (state.status === "archived") return no("This entry is archived. Restore it before publishing.");
  if (version < 1 || version > state.currentVersion) return no("That version does not exist.");
  return ok;
}

export function canSchedulePublication(state: VersionState, version: number, publishAt: Date, now: Date): TransitionCheck {
  const base = canPublish(state, version);
  if (!base.ok) return base;
  if (publishAt.getTime() <= now.getTime()) return no("Choose a publication time in the future.");
  if (state.unpublishAt && state.unpublishAt.getTime() <= publishAt.getTime()) return no("The unpublish time must be after the publication time.");
  return ok;
}

export function canScheduleUnpublish(state: VersionState, unpublishAt: Date, now: Date, publishAt: Date | null): TransitionCheck {
  if (state.deletedAt) return no("This entry is in the bin.");
  if (state.status === "archived") return no("This entry is archived.");
  if (unpublishAt.getTime() <= now.getTime()) return no("Choose an unpublish time in the future.");
  if (publishAt && unpublishAt.getTime() <= publishAt.getTime()) return no("The unpublish time must be after the publication time.");
  return ok;
}

export function canTakeOffline(state: VersionState): TransitionCheck {
  if (state.deletedAt) return no("This entry is in the bin.");
  if (state.status !== "published" && state.status !== "scheduled") return no("This entry is not published or scheduled.");
  return ok;
}

export function canRollback(state: VersionState, version: number): TransitionCheck {
  if (state.deletedAt) return no("This entry is in the bin. Restore it first.");
  if (version < 1 || version > state.currentVersion) return no("That version does not exist.");
  if (version === state.currentVersion) return no("That is already the latest version.");
  return ok;
}

/** Status after scheduling a publication: first publications become `scheduled`; live entries stay `published`. */
export function statusAfterSchedule(state: Pick<VersionState, "status" | "publishedVersion">): CmsEntryStatus {
  return state.status === "published" && state.publishedVersion !== null ? "published" : "scheduled";
}

/** Status after clearing a pending publication. */
export function statusAfterClearingSchedule(state: Pick<VersionState, "status">): CmsEntryStatus {
  return state.status === "scheduled" ? "draft" : state.status;
}

/**
 * After publishing `version`: keep a schedule only when it pins a NEWER version (a scheduled update);
 * a schedule for this or an older version is fulfilled/superseded.
 */
export function scheduleAfterPublish(state: Pick<VersionState, "scheduledVersion" | "publishAt">, version: number): Pick<VersionState, "scheduledVersion" | "publishAt"> {
  if (state.scheduledVersion !== null && state.scheduledVersion > version) return { scheduledVersion: state.scheduledVersion, publishAt: state.publishAt };
  return { scheduledVersion: null, publishAt: null };
}

/** Consent of the featured people/organisation allows publication right now (status obtained and not expired). */
export function consentAllowsPublication(consent: { consentStatus: ContentConsentStatus; consentExpiresAt: Date | null }, now: Date): boolean {
  return consent.consentStatus === "obtained" && (consent.consentExpiresAt === null || consent.consentExpiresAt.getTime() > now.getTime());
}

/** sortOrder values for an ordered list of ids (gaps of 10 leave room for manual inserts). */
export function sortOrdersFor(ids: readonly string[]): Map<string, number> {
  return new Map(ids.map((id, index) => [id, (index + 1) * 10]));
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type VersionContent = {
  slug: string;
  title: string;
  summary: string | null;
  data: Record<string, unknown>;
  seo: CmsSeo;
  tags: string[];
  heroAssetId: string | null;
};

function same(a: unknown, b: unknown): boolean {
  return stableStringify(a ?? null) === stableStringify(b ?? null);
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function change(path: string, label: string, before: unknown, after: unknown): FieldChange | null {
  if (same(before, after)) return null;
  const kind = isEmpty(before) ? "added" : isEmpty(after) ? "removed" : "changed";
  return { path, label, kind, before: before ?? null, after: after ?? null };
}

function diffFields(fields: FieldMap, before: Record<string, unknown>, after: Record<string, unknown>, path: string, labelPrefix: string, out: FieldChange[]): void {
  for (const [name, d] of Object.entries(fields) as [string, FieldDescriptor][]) {
    const p = `${path}.${name}`;
    const label = labelPrefix ? `${labelPrefix} › ${d.label}` : d.label;
    const b = before[name];
    const a = after[name];
    if (d.type === "group" && (typeof b === "object" || typeof a === "object")) {
      const bo = b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
      const ao = a && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : {};
      diffFields(d.fields, bo, ao, p, label, out);
      continue;
    }
    const c = change(p, label, b, a);
    if (c) out.push(c);
  }
  // Keys no longer described by the collection (schema changed since the old version).
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (name in fields) continue;
    const c = change(`${path}.${name}`, `${labelPrefix ? `${labelPrefix} › ` : ""}${name} (no longer used)`, before[name], after[name]);
    if (c) out.push(c);
  }
}

/** Field-level differences between two versions, in editor order (top-level fields, then data, then SEO). */
export function diffVersionContent(fields: FieldMap, before: VersionContent, after: VersionContent): FieldChange[] {
  const out: FieldChange[] = [];
  const top: [keyof VersionContent, string][] = [
    ["title", "Title"],
    ["slug", "URL slug"],
    ["summary", "Summary"],
    ["heroAssetId", "Hero image"],
    ["tags", "Tags"],
  ];
  for (const [key, label] of top) {
    const c = change(key, label, before[key], after[key]);
    if (c) out.push(c);
  }
  diffFields(fields, before.data ?? {}, after.data ?? {}, "data", "", out);
  const seoLabels: Record<string, string> = {
    title: "SEO title",
    description: "SEO description",
    ogImageAssetId: "Social preview image",
    noindex: "Hide from search engines",
    canonicalUrl: "Canonical URL",
  };
  const seoBefore = (before.seo ?? {}) as Record<string, unknown>;
  const seoAfter = (after.seo ?? {}) as Record<string, unknown>;
  for (const key of new Set([...Object.keys(seoLabels), ...Object.keys(seoBefore), ...Object.keys(seoAfter)])) {
    const c = change(`seo.${key}`, seoLabels[key] ?? `SEO ${key}`, seoBefore[key], seoAfter[key]);
    if (c) out.push(c);
  }
  return out;
}

/** True when two versions hold the same content (saving would create an identical version). */
export function sameContent(a: VersionContent, b: VersionContent): boolean {
  return (
    a.slug === b.slug &&
    a.title === b.title &&
    (a.summary ?? null) === (b.summary ?? null) &&
    (a.heroAssetId ?? null) === (b.heroAssetId ?? null) &&
    same(a.tags, b.tags) &&
    same(a.data, b.data) &&
    same(a.seo, b.seo)
  );
}
