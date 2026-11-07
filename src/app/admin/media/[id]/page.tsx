import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";
import { z } from "zod";

import { ConsentForm } from "@/components/cms/consent-form";
import { MediaAssetActions } from "@/components/cms/media-asset-actions";
import { MediaDetailsForm } from "@/components/cms/media-details-form";
import { toCalendarDate } from "@/components/cms/types";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff } from "@/modules/identity/authz";
import { updateMediaConsentAction } from "@/modules/content/actions";
import { CONTENT_CONSENT_STATUS_LABELS, MEDIA_KIND_LABELS } from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import { getMediaAsset, listMediaFolders } from "@/modules/content/queries";
import { getFile, toFileSummary } from "@/modules/files";

export const metadata: Metadata = { title: "Media item" };

type Params = Promise<{ id: string }>;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function MediaAssetPage({ params }: { params: Params }) {
  const ctx = await requireStaff("media.manage");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await getMediaAsset(ctx, id);
  if (!detail) notFound();
  const { asset, file } = detail;
  const [folders, consentFile] = await Promise.all([listMediaFolders(ctx), asset.consentFileId ? getFile(asset.consentFileId) : Promise.resolve(null)]);
  const isImage = asset.kind === "image";
  const showsPeople = asset.showsIdentifiablePeople === true;

  return (
    <div className="space-y-6">
      <PageHeader
        title={asset.title}
        eyebrow={MEDIA_KIND_LABELS[asset.kind]}
        breadcrumbs={[
          { label: "Command Centre", href: "/admin" },
          { label: "Media library", href: CONTENT_ADMIN_PATHS.media },
          ...(detail.folder ? [{ label: detail.folder.name, href: `${CONTENT_ADMIN_PATHS.media}?folder=${detail.folder.id}` }] : []),
          { label: asset.title },
        ]}
        status={
          <span className="flex flex-wrap gap-1">
            <StatusBadge tone={asset.visibility === "public" ? "success" : "neutral"}>{asset.visibility === "public" ? "Public" : "Internal"}</StatusBadge>
            {asset.status === "archived" && <StatusBadge tone="warning">Archived</StatusBadge>}
          </span>
        }
      />

      {file && (file.scanStatus === "pending" || file.scanStatus === "infected") && (
        <Callout tone={file.scanStatus === "infected" ? "danger" : "info"} title={file.scanStatus === "infected" ? "This file failed the malware check" : "The file is still being checked"}>
          {file.scanStatus === "infected" ? "It cannot be used. Delete it and upload a clean copy." : "It can be used once the automatic check has finished."}
        </Callout>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Preview">
            {isImage && detail.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- staff preview of the stored file
              <img src={detail.url} alt={asset.altText ?? ""} className="max-h-[28rem] w-full rounded-lg bg-surface-subtle object-contain" />
            ) : asset.kind === "embed" && asset.embedUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-navy-deep">
                <iframe src={asset.embedUrl} title={asset.title} className="size-full" loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" />
              </div>
            ) : asset.kind === "video" && detail.url ? (
              <video src={detail.url} controls preload="metadata" className="w-full rounded-lg bg-navy-deep">
                <track kind="captions" />
              </video>
            ) : detail.url ? (
              <a href={detail.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-medium text-teal-strong underline-offset-2 hover:underline">
                <FileText className="size-5" aria-hidden />
                Open {file?.originalName ?? "file"}
                <ExternalLink className="size-4" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <EmptyState size="sm" variant="plain" title="No preview available" />
            )}
          </SectionCard>

          <SectionCard title="Details" description="Alt text, caption and credit travel with the item wherever it is used.">
            <MediaDetailsForm
              values={{
                id: asset.id,
                kind: asset.kind,
                title: asset.title,
                altText: asset.altText,
                caption: asset.caption,
                description: asset.description,
                credit: asset.credit,
                tags: asset.tags,
                folderId: asset.folderId,
                showsIdentifiablePeople: asset.showsIdentifiablePeople,
              }}
              folders={folders.map((f) => ({ value: f.id, label: f.name }))}
            />
          </SectionCard>

          {(showsPeople || asset.consentStatus !== "not_required") && (
            <SectionCard
              title="Consent of the people shown"
              description="Required before a photo or video of identifiable people can be public. Public use then goes to the approval centre so a second person checks the evidence."
            >
              <div className="space-y-3">
                <p className="text-sm">
                  Current:{" "}
                  <StatusBadge tone={asset.consentStatus === "obtained" ? "success" : asset.consentStatus === "withdrawn" ? "danger" : "warning"} size="sm">
                    {CONTENT_CONSENT_STATUS_LABELS[asset.consentStatus]}
                  </StatusBadge>
                  {asset.consentExpiresAt && (
                    <span className="ml-2 text-muted-foreground">
                      until <DateText value={asset.consentExpiresAt} dateOnly />
                    </span>
                  )}
                </p>
                <ConsentForm
                  action={updateMediaConsentAction}
                  id={asset.id}
                  subject="the people shown"
                  allowNotRequired={!showsPeople}
                  current={{
                    status: asset.consentStatus,
                    notes: asset.consentNotes,
                    obtainedAt: toCalendarDate(asset.consentObtainedAt),
                    expiresAt: toCalendarDate(asset.consentExpiresAt),
                    file: consentFile ? toFileSummary(consentFile) : null,
                  }}
                />
              </div>
            </SectionCard>
          )}

          <SectionCard title="Where it is used" description="Pages and records that show this item." flush>
            {detail.usages.length === 0 ? (
              <EmptyState size="sm" variant="plain" title="Not used anywhere yet" description="Choose it from any image field in the content editor." />
            ) : (
              <ul className="divide-y">
                {detail.usages.map((u) => (
                  <li key={`${u.entityType}-${u.entityId}-${u.field}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    {u.href ? (
                      <Link href={u.href} className="font-medium underline-offset-2 hover:underline">
                        {u.label}
                      </Link>
                    ) : (
                      <span className="font-medium">{u.label}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{u.field}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Visibility and file">
          <SectionCard title="Website use" headingLevel="h2">
            <MediaAssetActions
              id={asset.id}
              visibility={asset.visibility}
              status={asset.status}
              usageCount={detail.usages.length}
              showsPeople={showsPeople}
              consentObtained={asset.consentStatus === "obtained"}
              peopleAssessed={asset.showsIdentifiablePeople !== null}
              altMissing={isImage && asset.altText === null}
              openApprovalCode={detail.openApproval?.code ?? null}
              crop={
                isImage && detail.url && file
                  ? { id: asset.id, title: asset.title, url: detail.url, mimeType: file.mimeType, altText: asset.altText, showsIdentifiablePeople: asset.showsIdentifiablePeople, folderId: asset.folderId, credit: asset.credit }
                  : null
              }
            />
            {detail.openApproval && (
              <Link href={`/admin/approvals/${detail.openApproval.id}`} className="mt-3 block text-sm font-medium text-teal-strong underline-offset-2 hover:underline">
                Open approval {detail.openApproval.code}
              </Link>
            )}
          </SectionCard>
          <SectionCard title="File" headingLevel="h2">
            <KeyValueList
              dense
              columns={1}
              items={[
                { label: "Name", value: file?.originalName ?? (asset.kind === "embed" ? "Video link" : "—") },
                { label: "Type", value: file?.mimeType ?? (asset.embedProvider ? asset.embedProvider : "—") },
                { label: "Size", value: file ? formatBytes(file.sizeBytes) : "—" },
                ...(file?.width && file.height ? [{ label: "Dimensions", value: `${file.width} × ${file.height} px` }] : []),
                { label: "Uploaded", value: <DateText value={asset.createdAt} /> },
                { label: "Uploaded by", value: detail.uploadedByName ?? "—" },
              ]}
            />
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
