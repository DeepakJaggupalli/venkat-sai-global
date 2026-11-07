import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RequirementStatusBadge } from "@/components/employer/requirement-status-badge";
import { SALARY_PERIOD_LABELS } from "@/components/employer/labels";
import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { FileList } from "@/components/shared/file-list";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText, SalaryRangeText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline, type TimelineItem } from "@/components/shared/timeline";
import { env } from "@/lib/env";
import { orgCan, requireOrgMember } from "@/modules/identity/authz";
import {
  REQUIREMENT_BENEFIT_OPTIONS,
  REQUIREMENT_EMPLOYER_CANCELLABLE,
  REQUIREMENT_INTERVIEW_METHOD_LABELS,
  REQUIREMENT_KIND_LABELS,
  REQUIREMENT_STATUS_LABELS,
  REQUIREMENT_URGENCY_LABELS,
} from "@/modules/operations/constants";
import { getOrgRequirement } from "@/modules/operations/queries";

import { loadEntityTimeline } from "../../jobs/_lib/timeline";
import { RequirementActions } from "../_components/requirement-actions";
import { loadRequirementAttachments, loadRequirementSubmitBlock } from "../_lib/form-data";
import { getAccountManagerName } from "../_lib/queries";

export const metadata: Metadata = { title: "Workforce requirement" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statusLabel = (s: unknown) => (typeof s === "string" ? (REQUIREMENT_STATUS_LABELS[s as keyof typeof REQUIREMENT_STATUS_LABELS] ?? s) : null);
const DECISION_TITLES: Record<string, string> = { approved: "Approved by Venkat Sai", rejected: "Not accepted by Venkat Sai", changes_requested: "Changes requested by Venkat Sai" };
const benefitLabel = (b: string) => REQUIREMENT_BENEFIT_OPTIONS.find((o) => o.value === b)?.label ?? b;
const yesNo = (v: boolean) => (v ? "Yes" : "No");

export default async function EmployerRequirementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgMember("employer", "employer.requirements.manage");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const r = await getOrgRequirement(ctx, id);
  if (!r) notFound();
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const canViewJobs = orgCan(ctx, "employer.jobs.view");

  const [events, attachments, contactName, submitBlockedReason] = await Promise.all([
    loadEntityTimeline({
      organizationId: ctx.organization.id,
      entityType: "requirement_request",
      entityId: r.id,
      actions: ["requirement.created", "requirement.submitted", "requirement.updated", "requirement.approval_decided", "requirement.status_changed", "requirement.cancelled"],
      metadataKeys: ["to", "reason", "decision", "asDraft"],
    }),
    loadRequirementAttachments(ctx, r.attachmentFileIds),
    getAccountManagerName(ctx),
    r.status === "draft" ? loadRequirementSubmitBlock(ctx) : Promise.resolve(null),
  ]);

  const timeline: TimelineItem[] = events.map((e) => {
    const m = e.metadata;
    const reason = typeof m.reason === "string" && m.reason ? m.reason : null;
    let title = "Updated";
    let tone: TimelineItem["tone"];
    switch (e.action) {
      case "requirement.created":
        title = m.asDraft ? "Draft created" : "Created";
        break;
      case "requirement.submitted":
        title = "Submitted to Venkat Sai";
        tone = "info";
        break;
      case "requirement.updated":
        title = "Details updated";
        break;
      case "requirement.approval_decided":
        title = DECISION_TITLES[String(m.decision)] ?? "Reviewed by Venkat Sai";
        tone = m.decision === "approved" ? "success" : m.decision === "rejected" ? "danger" : "warning";
        break;
      case "requirement.status_changed":
        title = `Status changed to ${statusLabel(m.to) ?? "a new status"}`;
        tone = m.to === "filled" ? "success" : m.to === "on_hold" ? "warning" : "brand";
        break;
      case "requirement.cancelled":
        title = "Cancelled";
        tone = "neutral";
        break;
    }
    return {
      id: e.id,
      title,
      at: e.at,
      actor: e.byVenkatSai ? { name: "Venkat Sai" } : e.actorName ? { name: e.actorName } : null,
      note: reason ?? undefined,
      tone,
    };
  });

  const linkedJobs = r.lines.filter((l) => l.jobId);
  const filled = r.lines.reduce((sum, l) => sum + (l.filledCount ?? 0), 0);

  return (
    <div className="space-y-8">
      <PortalBreadcrumb items={[{ label: "Workforce requirements", href: "/employer/requirements" }, { label: r.title }]} />
      <PageHeader
        title={r.title}
        eyebrow={r.code}
        status={<RequirementStatusBadge status={r.status} size="md" />}
        backLink={{ href: "/employer/requirements", label: "Back to requirements" }}
        meta={
          <span className="text-sm text-muted-foreground">
            {REQUIREMENT_KIND_LABELS[r.kind]} · {r.totalPositions} position{r.totalPositions === 1 ? "" : "s"} · {REQUIREMENT_URGENCY_LABELS[r.urgency]} urgency
          </span>
        }
      />

      <RequirementActions requirementId={r.id} isDraft={r.status === "draft"} cancellable={REQUIREMENT_EMPLOYER_CANCELLABLE.includes(r.status)} submitBlockedReason={submitBlockedReason} />

      {r.statusReason && ["draft", "on_hold", "cancelled", "closed"].includes(r.status) ? (
        <Callout tone={r.status === "draft" || r.status === "on_hold" ? "warning" : "neutral"} title={r.status === "draft" ? "Venkat Sai asked for changes" : `Note from Venkat Sai (${statusLabel(r.status)})`}>
          {r.statusReason}
        </Callout>
      ) : null}
      {r.status === "submitted" || r.status === "under_review" ? (
        <Callout tone="info" title="With Venkat Sai for review">
          We will confirm the requirement and next steps. You will be notified of every status change.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Trades and positions" flush>
            <ul className="divide-y divide-border">
              {r.lines.map((l) => (
                <li key={l.id} className="space-y-1 px-5 py-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <p className="font-medium text-foreground">{l.roleTitle}</p>
                    <p className="text-sm text-muted-foreground">
                      {l.positions} position{l.positions === 1 ? "" : "s"}
                      {l.filledCount ? ` · ${l.filledCount} filled` : ""}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[
                      l.experienceMinYears !== null || l.experienceMaxYears !== null ? `${l.experienceMinYears ?? 0}–${l.experienceMaxYears ?? "any"} years` : null,
                      l.qualification,
                      l.requiredSkills.length ? l.requiredSkills.join(", ") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No further details"}
                  </p>
                  {l.salaryMinMinor !== null || l.salaryMaxMinor !== null ? (
                    <p className="text-sm text-foreground">
                      <SalaryRangeText minMinor={l.salaryMinMinor} maxMinor={l.salaryMaxMinor} currency={l.salaryCurrency} period={l.salaryPeriod ?? undefined} />
                      {l.salaryPeriod ? <span className="sr-only"> {SALARY_PERIOD_LABELS[l.salaryPeriod]}</span> : null}
                    </p>
                  ) : null}
                  {l.notes ? <p className="whitespace-pre-line text-sm text-muted-foreground">{l.notes}</p> : null}
                  {l.jobId ? (
                    <p className="text-sm">
                      Linked job:{" "}
                      {canViewJobs ? (
                        <Link href={`/employer/jobs/${l.jobId}`} className="font-medium text-teal-strong underline underline-offset-4">
                          {l.jobTitle ?? l.jobCode ?? "View job"}
                        </Link>
                      ) : (
                        (l.jobTitle ?? l.jobCode)
                      )}
                      {l.jobStatus ? (
                        <>
                          {" "}
                          <StatusBadge status={l.jobStatus} domain="job" size="sm" />
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Work, conditions and selection">
            <KeyValueList
              columns={2}
              items={[
                { label: "Country of work", value: r.countryCode },
                { label: "Work sites", value: r.locations },
                { label: "Joining by", value: r.joiningBy ? <DateText value={r.joiningBy} dateOnly /> : null },
                { label: "Contract", value: r.contractDurationMonths ? `${r.contractDurationMonths} months` : null },
                { label: "Working hours", value: r.workingHours },
                { label: "Languages", value: r.languageRequirements },
                { label: "Accommodation", value: yesNo(r.accommodationProvided) },
                { label: "Food", value: yesNo(r.foodProvided) },
                { label: "Transport", value: yesNo(r.transportProvided) },
                { label: "Benefits", value: r.benefits.length ? r.benefits.map(benefitLabel).join(", ") : null, fullWidth: true },
                { label: "Interview", value: r.interviewMethod ? REQUIREMENT_INTERVIEW_METHOD_LABELS[r.interviewMethod] : null, hint: r.interviewDetails ?? undefined },
                { label: "Trade test", value: r.assessmentRequired ? "Required" : "Not required", hint: r.assessmentDetails ?? undefined },
                { label: "Documents needed", value: r.documentationRequirements, fullWidth: true },
                { label: "Description", value: r.description ? <span className="whitespace-pre-line">{r.description}</span> : null, fullWidth: true },
              ]}
            />
          </SectionCard>

          {attachments.length ? (
            <SectionCard title="Attachments">
              <FileList label="Requirement attachments" files={attachments.map((f) => ({ id: f.id, name: f.name, size: f.size ?? undefined, mimeType: f.mimeType, href: f.url }))} />
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          <SectionCard title="Summary">
            <KeyValueList
              items={[
                { label: "Status", value: <RequirementStatusBadge status={r.status} /> },
                { label: "Your Venkat Sai contact", value: contactName ?? "The Venkat Sai recruitment team", hint: "Message us from Messages for questions about this requirement." },
                { label: "Positions filled", value: `${filled} of ${r.totalPositions}` },
                { label: "Linked jobs", value: linkedJobs.length || null },
                { label: "Submitted", value: r.submittedAt ? <DateText value={r.submittedAt} timeZone={timeZone} /> : null },
                { label: "Approved", value: r.approvedAt ? <DateText value={r.approvedAt} timeZone={timeZone} /> : null },
                { label: "Quotation", value: r.quotedFeeMinor !== null && r.quotedFeeCurrency ? <MoneyText amountMinor={r.quotedFeeMinor} currency={r.quotedFeeCurrency} /> : null },
                { label: "Contact person", value: [r.contactName, r.contactDesignation].filter(Boolean).join(", ") || null },
              ]}
              emptyText="Not yet"
            />
          </SectionCard>
          <SectionCard title="Status timeline">
            <Timeline items={timeline} timeZone={timeZone} label="Requirement history" emptyTitle="No history yet" />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
