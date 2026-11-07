import Link from "next/link";

import { ConsentForm } from "@/components/cms/consent-form";
import { EntryEditor } from "@/components/cms/entry-editor";
import { LogoPermissionPicker } from "@/components/cms/logo-permission-picker";
import { VersionHistory } from "@/components/cms/version-history";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { CONTENT_CONSENT_STATUS_LABELS, CONTENT_LOCALE_LABELS } from "@/modules/content/constants";
import { updateEntryConsentAction } from "@/modules/content/actions";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";

import type { EditorPageData } from "./editor-data";

const CONSENT_SUBJECT: Record<string, string> = {
  testimonials: "the person quoted",
  case_studies: "the client featured",
  team_members: "the team member",
};

/** Page body shared by the entry route and the singleton editors. */
export function EntryEditorView({ data, title, breadcrumbs }: { data: EditorPageData; title: string; breadcrumbs: { label: string; href?: string }[] }) {
  const { descriptor, entry, consent } = data;
  const showConsent = descriptor.consentRequired || entry.collection === "team_members";
  const approvalCollection = Boolean(descriptor.approvalType);

  const sidebar = (
    <>
      {(data.openApproval || data.latestApproval?.status === "rejected" || data.latestApproval?.status === "changes_requested") && (
        <SectionCard title="Approval" headingLevel="h2">
          {data.openApproval ? (
            <div className="space-y-2 text-sm">
              <p>
                Awaiting a decision in the approval centre (<span className="font-medium">{data.openApproval.code}</span>), submitted <DateText value={data.openApproval.createdAt} />.
              </p>
              <Link href={`/admin/approvals/${data.openApproval.id}`} className="font-medium text-teal-strong underline-offset-2 hover:underline">
                Open the request
              </Link>
            </div>
          ) : data.latestApproval ? (
            <div className="space-y-2 text-sm">
              <StatusBadge status={data.latestApproval.status} domain="approval" size="sm" />
              {data.latestApproval.decisionReason && <p className="text-muted-foreground">{data.latestApproval.decisionReason}</p>}
            </div>
          ) : null}
        </SectionCard>
      )}

      {showConsent && (
        <SectionCard
          title="Consent evidence"
          headingLevel="h2"
          description={
            descriptor.consentRequired
              ? "Required to publish. A second person checks the evidence in the approval centre before it goes live."
              : "Record consent before publishing a named, pictured person."
          }
        >
          <div className="space-y-3">
            <p className="text-sm">
              Current: <StatusBadge tone={consent.status === "obtained" ? "success" : consent.status === "withdrawn" ? "danger" : consent.status === "pending" ? "warning" : "neutral"} size="sm">{CONTENT_CONSENT_STATUS_LABELS[consent.status]}</StatusBadge>
            </p>
            <ConsentForm
              action={updateEntryConsentAction}
              id={entry.id}
              current={consent}
              subject={CONSENT_SUBJECT[entry.collection] ?? "the people featured"}
              allowNotRequired={!descriptor.consentRequired}
              disabled={!data.can.edit || entry.deleted}
            />
          </div>
        </SectionCard>
      )}

      {entry.collection === "client_logos" && (
        <SectionCard title="Logo permission" headingLevel="h2" description="A logo is shown only with an approved, unexpired written permission covering the page it appears on.">
          <div className="space-y-3">
            {data.logoPermission ? (
              <p className="text-sm">
                Linked:{" "}
                <Link href={CONTENT_ADMIN_PATHS.logoPermission(data.logoPermission.id)} className="font-medium text-teal-strong underline-offset-2 hover:underline">
                  {data.logoPermission.organizationName}
                </Link>{" "}
                <StatusBadge status={data.logoPermission.status} size="sm" />
              </p>
            ) : (
              <Callout tone="warning">No permission is linked, so this logo cannot be published.</Callout>
            )}
            <LogoPermissionPicker entryId={entry.id} currentId={data.logoPermission?.id ?? null} options={data.usableLogoPermissions} disabled={!data.can.edit || entry.deleted} />
            <Link href={CONTENT_ADMIN_PATHS.logoPermissions} className="block text-sm font-medium text-teal-strong underline-offset-2 hover:underline">
              Manage logo permissions
            </Link>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Version history" headingLevel="h2" description="Every save is kept. Compare versions or restore an earlier one.">
        <VersionHistory entryId={entry.id} versions={data.versions} canRollback={data.can.publish && !entry.deleted} approvalCollection={approvalCollection} />
      </SectionCard>

      {data.mediaUsageCount > 0 && <p className="px-1 text-xs text-muted-foreground">Uses {data.mediaUsageCount} media {data.mediaUsageCount === 1 ? "item" : "items"} from the library.</p>}
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={descriptor.description}
        breadcrumbs={breadcrumbs}
        eyebrow={`${descriptor.singularLabel} · ${CONTENT_LOCALE_LABELS[entry.locale as keyof typeof CONTENT_LOCALE_LABELS] ?? entry.locale}`}
      />
      <EntryEditor descriptor={descriptor} entry={entry} latest={data.latest} publicPath={data.publicPath} options={data.options} can={data.can} sidebar={sidebar} />
    </div>
  );
}
