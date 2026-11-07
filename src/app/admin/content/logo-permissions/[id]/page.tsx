import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { LogoPermissionActions } from "@/components/cms/logo-permission-actions";
import { LogoPermissionForm } from "@/components/cms/logo-permission-form";
import { toCalendarDate } from "@/components/cms/types";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { CMS_ENTRY_STATUS_LABELS, LOGO_PERMISSION_STATUS_LABELS } from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import { getLogoPermission } from "@/modules/content/queries";
import { getFile, toFileSummary } from "@/modules/files";

import { loadPickerAssets } from "../../_lib/editor-data";

export const metadata: Metadata = { title: "Logo permission" };

type Params = Promise<{ id: string }>;
const TONE = { pending: "warning", approved: "success", expired: "neutral", revoked: "danger" } as const;

export default async function LogoPermissionPage({ params }: { params: Params }) {
  const ctx = await requireStaff(["content.view", "content.edit"], "any");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const p = await getLogoPermission(ctx, id);
  if (!p) notFound();
  const [evidence, assets] = await Promise.all([p.evidenceFileId ? getFile(p.evidenceFileId) : Promise.resolve(null), p.logoAssetId ? loadPickerAssets(ctx, [p.logoAssetId]) : Promise.resolve({})]);
  const canEdit = staffCan(ctx, "content.edit") && (p.status === "pending" || staffCan(ctx, "content.publish")) && p.status !== "revoked";
  const canDecide = staffCan(ctx, "content.publish");

  return (
    <div className="space-y-6">
      <PageHeader
        title={p.organizationName}
        eyebrow="Logo permission"
        breadcrumbs={[{ label: "Content", href: CONTENT_ADMIN_PATHS.content }, { label: "Logo permissions", href: CONTENT_ADMIN_PATHS.logoPermissions }, { label: p.organizationName }]}
        status={<StatusBadge tone={TONE[p.status]}>{LOGO_PERMISSION_STATUS_LABELS[p.status]}</StatusBadge>}
      />
      {p.status === "revoked" && (
        <Callout tone="danger" title="Revoked">
          {p.revokedReason ?? "This permission was revoked."} Linked logos are offline.
        </Callout>
      )}
      {p.status === "expired" && <Callout tone="warning" title="Expired">Linked logos went offline when it expired. Record a new permission to show them again.</Callout>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <SectionCard title="Details and evidence">
          <LogoPermissionForm
            disabled={!canEdit}
            assets={assets}
            canUpload={staffCan(ctx, "media.manage")}
            values={{
              id: p.id,
              organizationName: p.organizationName,
              relationship: p.relationship,
              logoAssetId: p.logoAssetId,
              permissionType: p.permissionType,
              evidenceFile: evidence ? toFileSummary(evidence) : null,
              evidenceReference: p.evidenceReference,
              grantedByName: p.grantedByName,
              grantedByDesignation: p.grantedByDesignation,
              grantedAt: toCalendarDate(p.grantedAt),
              expiresAt: toCalendarDate(p.expiresAt),
              displayLocations: p.displayLocations,
              conditions: p.conditions,
              notes: p.notes,
            }}
          />
        </SectionCard>
        <aside className="space-y-6" aria-label="Decision and linked logos">
          <SectionCard title="Decision" headingLevel="h2">
            <div className="space-y-4">
              <KeyValueList
                dense
                columns={1}
                items={[
                  { label: "Approved", value: p.approvedAt ? <DateText value={p.approvedAt} /> : "Not yet" },
                  { label: "Expires", value: p.expiresAt ? <DateText value={p.expiresAt} dateOnly /> : "No end date" },
                  ...(p.revokedAt ? [{ label: "Revoked", value: <DateText value={p.revokedAt} /> }] : []),
                ]}
              />
              {canDecide ? (
                <LogoPermissionActions id={p.id} status={p.status} linkedCount={p.linkedEntries.length} hasEvidence={Boolean(p.evidenceFileId || p.evidenceReference?.trim())} />
              ) : (
                <p className="text-sm text-muted-foreground">A publisher approves or revokes permissions.</p>
              )}
            </div>
          </SectionCard>
          <SectionCard title="Linked logos" headingLevel="h2" flush>
            {p.linkedEntries.length === 0 ? (
              <EmptyState size="sm" variant="plain" title="No logos linked" description="Link it from a client logo entry." primaryAction={{ label: "Client logos", href: CONTENT_ADMIN_PATHS.collection("client_logos"), variant: "outline" }} />
            ) : (
              <ul className="divide-y">
                {p.linkedEntries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                    <Link href={CONTENT_ADMIN_PATHS.entry("client_logos", e.id)} className="font-medium underline-offset-2 hover:underline">
                      {e.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">{CMS_ENTRY_STATUS_LABELS[e.status as keyof typeof CMS_ENTRY_STATUS_LABELS] ?? e.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
