import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Timeline } from "@/components/shared/timeline";
import { env } from "@/lib/env";
import { humanize } from "@/lib/format";
import { requireStaff } from "@/modules/identity/authz";
import { DATA_REQUEST_TYPE_DESCRIPTIONS, DATA_REQUEST_TYPE_LABELS, parseCloseAccountMarker, RETENTION_EXCEPTIONS } from "@/modules/privacy/constants";
import { getDataRequest } from "@/modules/privacy/queries";

import { staffOptionsWithPermission } from "../../support/_lib/staff";
import { DataRequestSlaBadge, DataRequestStatusBadge } from "../_components/badges";
import { AssignRequest, CompleteForm, EraseAccountForm, GenerateExportButton, RejectForm, StartButton, VerifyIdentityForm } from "../_components/request-actions";

export const metadata: Metadata = { title: "Privacy request" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PrivacyRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff("privacy.requests");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getDataRequest(ctx, id);
  if (!detail) notFound();
  const { request: r, account } = detail;
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const staffOptions = await staffOptionsWithPermission("privacy.requests");
  const { closeAccount, text } = parseCloseAccountMarker(r.details);
  const openState = r.status === "received" || r.status === "identity_verification" || r.status === "in_progress";
  const isOwn = r.userId === ctx.user.id;
  const defaultExceptions = RETENTION_EXCEPTIONS.map((e) => `- ${e.label}: ${e.reason}`).join("\n");

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Privacy requests", href: "/admin/privacy" }, { label: r.code }]} />
      <PageHeader eyebrow={r.code} title={DATA_REQUEST_TYPE_LABELS[r.type]} status={<DataRequestStatusBadge status={r.status} />} backLink={{ href: "/admin/privacy", label: "Back to privacy requests" }} />
      {isOwn ? <Callout tone="warning" title="This is your own request">Another team member must process it.</Callout> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Request" headingLevel="h2">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{DATA_REQUEST_TYPE_DESCRIPTIONS[r.type]}</p>
              {closeAccount ? <Callout tone="warning">The person also asked to close their account.</Callout> : null}
              <div>
                <h3 className="mb-1 text-sm font-semibold text-foreground">Details from the requester</h3>
                <p className="whitespace-pre-wrap text-sm text-foreground">{text ?? "No details provided."}</p>
              </div>
            </div>
          </SectionCard>

          {openState && !isOwn ? (
            <SectionCard title="Next step" headingLevel="h2">
              {r.status !== "in_progress" ? (
                r.identityVerifiedAt ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Identity is verified (signed-in account with a verified contact, or emailed code).</p>
                    <StartButton id={r.id} />
                  </div>
                ) : (
                  <VerifyIdentityForm id={r.id} canAsk={r.status === "received"} />
                )
              ) : r.type === "export" || r.type === "access" ? (
                r.userId ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">The export contains the account, candidate profile and sections, candidate-visible applications, consents, notifications, support requests and analytics summary.</p>
                    <GenerateExportButton id={r.id} />
                    {r.type === "access" ? <CompleteForm id={r.id} hint="Or answer with a written summary instead of a file." /> : null}
                  </div>
                ) : (
                  <CompleteForm id={r.id} hint="No account is linked: reply with what we hold about this person." />
                )
              ) : r.type === "deletion" && r.userId ? (
                account?.isStaff ? (
                  <Callout tone="warning">Staff accounts are closed through team offboarding. Decline this request with an explanation or hand it to a super admin.</Callout>
                ) : (
                  <EraseAccountForm id={r.id} defaultExceptions={defaultExceptions} />
                )
              ) : (
                <CompleteForm
                  id={r.id}
                  hint={r.type === "correction" ? "Correct the data in the relevant record first (for example the candidate profile), then summarise what changed." : undefined}
                />
              )}
            </SectionCard>
          ) : null}

          {r.resolution ? (
            <SectionCard title={r.status === "rejected" ? "Reason given" : "Resolution"} headingLevel="h2">
              <p className="whitespace-pre-wrap text-sm text-foreground">{r.resolution}</p>
            </SectionCard>
          ) : null}
          {r.retentionExceptions ? (
            <SectionCard title="Records kept (retention exceptions)" headingLevel="h2">
              <p className="whitespace-pre-wrap text-sm text-foreground">{r.retentionExceptions}</p>
            </SectionCard>
          ) : null}

          <SectionCard title="History" headingLevel="h2">
            <Timeline
              label="Request history"
              items={detail.history.map((h) => ({ id: h.id, title: humanize(h.action.replace(/^privacy\./, "")), at: h.at, actor: h.actorName ? { name: h.actorName } : undefined }))}
              timeZone={timeZone}
              emptyTitle="No history yet"
            />
          </SectionCard>

          {openState && !isOwn ? (
            <SectionCard title="Decline" description="Only when the request cannot be fulfilled (for example identity could not be confirmed)." headingLevel="h2">
              <RejectForm id={r.id} />
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-6">
          <SectionCard title="Deadline" headingLevel="h2">
            <KeyValueList
              columns={1}
              dense
              items={[
                { label: "Due", value: r.dueAt ? <span className="flex flex-wrap items-center gap-2"><DataRequestSlaBadge status={r.status} dueAt={r.dueAt} /><DateText value={r.dueAt} timeZone={timeZone} /></span> : "No deadline" },
                { label: "Received", value: <DateText value={r.createdAt} mode="datetime" timeZone={timeZone} /> },
                ...(r.completedAt ? [{ label: "Closed", value: <DateText value={r.completedAt} mode="datetime" timeZone={timeZone} /> }] : []),
              ]}
            />
            {openState ? (
              <div className="mt-4">
                <AssignRequest id={r.id} handlerId={r.handledByUserId} staffOptions={staffOptions} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Handled by {detail.handlerName ?? "—"}</p>
            )}
          </SectionCard>
          <SectionCard title="Requester" headingLevel="h2">
            <KeyValueList
              columns={1}
              dense
              items={[
                { label: "Name", value: r.requesterName ?? account?.displayName ?? "Not provided" },
                { label: "Email", value: r.requesterEmail ?? "Not provided" },
                { label: "Phone", value: r.requesterPhone ?? "Not provided" },
                { label: "Identity", value: r.identityVerifiedAt ? <>Verified <DateText value={r.identityVerifiedAt} timeZone={timeZone} /></> : "Not verified" },
                {
                  label: "Account",
                  value: account ? (
                    <span>
                      {account.status === "closed" ? "Closed account" : "Has an account"}
                      {account.emailVerifiedAt || account.phoneVerifiedAt ? " · verified contact" : " · contact not verified"}
                      {account.isStaff ? " · staff" : ""}
                    </span>
                  ) : (
                    "No account linked"
                  ),
                },
              ]}
            />
            {account && account.status !== "closed" && !account.isStaff ? (
              <Link className="mt-3 inline-block text-sm font-medium text-teal-strong underline underline-offset-4" href={`/admin/users/${account.id}`}>
                Open account record
              </Link>
            ) : null}
          </SectionCard>
          {detail.exportFile ? (
            <SectionCard title="Export file" headingLevel="h2">
              <p className="text-sm text-muted-foreground">
                {detail.exportFile.deleted ? "The download window has ended and the file was deleted." : `Generated ${detail.exportFile.createdAt.toISOString().slice(0, 10)}. Only the account owner can download it.`}
              </p>
            </SectionCard>
          ) : null}
          {detail.tickets.length ? (
            <SectionCard title="Linked support requests" headingLevel="h2">
              <ul className="space-y-2 text-sm">
                {detail.tickets.map((t) => (
                  <li key={t.id}>
                    <Link className="font-medium text-teal-strong underline underline-offset-4" href={`/admin/support/${t.id}`}>
                      {t.code}
                    </Link>{" "}
                    <span className="text-muted-foreground">{t.subject}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
