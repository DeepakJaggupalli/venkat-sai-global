import "server-only";

import type { SelectOption } from "@/components/shared/types";
import type { EditorOptions } from "@/components/cms/editor-context";
import { asEditorFields, collectAssetIds, collectReferenceTargets, collectTaxonomyTargets, usesCountries } from "@/components/cms/field-utils";
import { toCalendarDate, type ConsentState, type EditorApproval, type EditorCapabilities, type EditorContent, type EditorEntry, type EditorVersion } from "@/components/cms/types";
import type { CmsCollection } from "@/db/schema";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { describeCollection, type CollectionDescriptor } from "@/modules/content/collections";
import { getMediaAsset, listReferenceOptions, listUsableLogoPermissions } from "@/modules/content/queries";
import type { AdminEntryDetail } from "@/modules/content/types";
import { getFile, toFileSummary } from "@/modules/files";
import { countryOptions, industryOptions, jobCategoryOptions, listLanguages } from "@/modules/taxonomy/queries";
import { toPickerAsset, type PickerAssetMap } from "@/app/admin/media/_lib/picker-types";

export function capabilitiesOf(ctx: StaffContext): EditorCapabilities {
  return { edit: staffCan(ctx, "content.edit"), publish: staffCan(ctx, "content.publish"), upload: staffCan(ctx, "media.manage") };
}

/** Media summaries for the given ids (only for staff allowed to browse the library). */
export async function loadPickerAssets(ctx: StaffContext, ids: Iterable<string>): Promise<PickerAssetMap> {
  if (!staffCan(ctx, ["media.manage", "content.edit"], "any")) return {};
  const unique = [...new Set(ids)].slice(0, 100);
  const details = await Promise.all(unique.map((id) => getMediaAsset(ctx, id).catch(() => null)));
  const map: PickerAssetMap = {};
  for (const d of details) if (d) map[d.asset.id] = toPickerAsset(d);
  return map;
}

async function taxonomyOptionsFor(keys: Set<string>): Promise<Record<string, SelectOption[]>> {
  const out: Record<string, SelectOption[]> = {};
  await Promise.all(
    [...keys].map(async (key) => {
      if (key === "industries") out[key] = await industryOptions();
      else if (key === "job_categories") out[key] = await jobCategoryOptions();
      else if (key === "languages") out[key] = (await listLanguages()).map((l) => ({ value: l.code, label: l.nativeName && l.nativeName !== l.name ? `${l.name} (${l.nativeName})` : l.name }));
      else out[key] = [];
    }),
  );
  return out;
}

export type EditorPageData = {
  descriptor: CollectionDescriptor;
  entry: EditorEntry;
  latest: EditorContent;
  publicPath: string | null;
  options: EditorOptions;
  can: EditorCapabilities;
  versions: EditorVersion[];
  openApproval: EditorApproval | null;
  latestApproval: EditorApproval | null;
  consent: ConsentState;
  logoPermission: AdminEntryDetail["logoPermission"];
  usableLogoPermissions: { id: string; organizationName: string; expiresAt: string | null }[];
  mediaUsageCount: number;
};

function approvalOf(a: AdminEntryDetail["openApproval"]): EditorApproval | null {
  return a ? { ...a, createdAt: a.createdAt.toISOString() } : null;
}

/** Everything the generic editor needs, as plain JSON. */
export async function loadEditorData(ctx: StaffContext, detail: AdminEntryDetail): Promise<EditorPageData> {
  const row = detail.entry;
  const collection = row.collection as CmsCollection;
  const descriptor = describeCollection(collection);
  const fields = asEditorFields(descriptor.fields);
  const latest = detail.latest;

  const refTargets = collectReferenceTargets(fields);
  const taxTargets = collectTaxonomyTargets(fields);
  const assetIds = collectAssetIds(fields, latest.data);
  if (latest.heroAssetId) assetIds.add(latest.heroAssetId);
  if (latest.seo.ogImageAssetId) assetIds.add(latest.seo.ogImageAssetId);

  const [referenceEntries, taxonomyOptions, countries, assets, consentFile, usable] = await Promise.all([
    Promise.all([...refTargets].map(async (c) => [c, await listReferenceOptions(ctx, c as CmsCollection, { locale: row.locale, limit: 100 })] as const)),
    taxonomyOptionsFor(taxTargets),
    usesCountries(fields) ? countryOptions() : Promise.resolve([]),
    loadPickerAssets(ctx, assetIds),
    row.consentFileId ? getFile(row.consentFileId) : Promise.resolve(null),
    collection === "client_logos" ? listUsableLogoPermissions(ctx) : Promise.resolve([]),
  ]);

  const referenceOptions: Record<string, SelectOption[]> = {};
  for (const [c, rows] of referenceEntries) {
    referenceOptions[c] = rows.filter((r) => r.id !== row.id).map((r) => ({ value: r.id, label: r.title, description: r.status === "published" ? undefined : `Not published (${r.status})` }));
  }

  const can = capabilitiesOf(ctx);
  return {
    descriptor,
    entry: {
      id: row.id,
      collection,
      locale: row.locale,
      status: row.status,
      currentVersion: row.currentVersion,
      publishedVersion: row.publishedVersion,
      scheduledVersion: row.scheduledVersion,
      publishAt: row.publishAt?.toISOString() ?? null,
      unpublishAt: row.unpublishAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      isFeatured: row.isFeatured,
      deleted: row.deletedAt !== null,
      updatedAt: row.updatedAt.toISOString(),
      consentStatus: row.consentStatus,
    },
    latest: { ...latest, data: latest.data ?? {}, seo: latest.seo ?? {}, tags: latest.tags ?? [] },
    publicPath: detail.publicPath,
    options: { locale: row.locale, referenceOptions, taxonomyOptions, countryOptions: countries, assets, canUpload: can.upload },
    can,
    versions: detail.versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
    openApproval: approvalOf(detail.openApproval),
    latestApproval: approvalOf(detail.latestApproval),
    consent: {
      status: row.consentStatus,
      notes: row.consentNotes,
      obtainedAt: toCalendarDate(row.consentObtainedAt),
      expiresAt: toCalendarDate(row.consentExpiresAt),
      file: consentFile ? toFileSummary(consentFile) : null,
    },
    logoPermission: detail.logoPermission,
    usableLogoPermissions: usable.map((p) => ({ id: p.id, organizationName: p.organizationName, expiresAt: toCalendarDate(p.expiresAt) })),
    mediaUsageCount: detail.mediaUsageCount,
  };
}
