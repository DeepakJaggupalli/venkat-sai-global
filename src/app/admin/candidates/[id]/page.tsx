import { Briefcase, ClipboardCheck, FileStack, GraduationCap, Stamp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InternalNotesPanel } from "@/components/admin/internal-notes";
import { listStaffOptions } from "@/components/admin/queries";
import { Callout } from "@/components/shared/callout";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressRing } from "@/components/shared/progress-ring";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { getCandidateView } from "@/modules/candidates/viewer";
import { RECOMMENDATION_LABELS } from "@/modules/recruitment/constants";
import { getApplicationForStaff } from "@/modules/recruitment/queries";
import { SKILL_ASSESSMENT_TYPE_LABELS } from "@/modules/training/constants";
import { listSkillAssessments } from "@/modules/training/skill-assessments";

import { openJobOptions } from "../../pipeline/_shared/options";
import { FormDialog } from "../../pipeline/_shared/form-dialog";
import { ReasonDialog } from "../../pipeline/_shared/reason-dialog";
import { isUuid, orNotFound, staffTimeZone } from "../../pipeline/_shared/server";
import { humanize, statusTone } from "../../pipeline/_shared/status";
import { assignToJobFormAction } from "../../pipeline/actions";
import { resolveDuplicateFlagFormAction, updateAttributionFormAction } from "../../partners/actions";
import { attributionsForCandidate, duplicateFlagsForCandidate } from "../../partners/_lib/queries";
import { enrolInBatchFormAction, openDocumentAction, revealContactAction, revealIdentityAction } from "../actions";
import { applicationsForCandidate, enrolmentsForCandidate, openVenkatSaiBatchOptions } from "../_lib/queries";
import { CredentialsSection, DocumentsSection, EducationSection, ExperienceSection } from "../_components/record-sections";
import { OpenDocumentButton, RevealContact, RevealIdentity } from "../_components/sensitive";

export const metadata: Metadata = { title: "Candidate" };

const LEVEL_LABELS: Record<string, string> = { none: "Not verified", basic: "Contact verified", documents_verified: "Documents verified", skills_assessed: "Skills assessed" };
const FLAG_CHOICES = [
  { value: "not_duplicate", label: "Not a duplicate" },
  { value: "confirmed_duplicate", label: "Confirmed duplicate" },
  { value: "merged", label: "Merged (records combined)" },
];

export default async function CandidateRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("candidates.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const view = await orNotFound(getCandidateView(id, { kind: "staff", ctx: staff }));
  const tz = staffTimeZone(staff);
  const can = {
    recruitment: staffCan(staff, ["recruitment.view", "recruitment.manage"], "any"),
    manageRecruitment: staffCan(staff, "recruitment.manage"),
    assess: staffCan(staff, ["recruitment.assessments", "recruitment.view"], "any"),
    schedule: staffCan(staff, "recruitment.assessments"),
    training: staffCan(staff, ["training.view", "training.manage"], "any"),
    enrol: staffCan(staff, "training.manage"),
    verify: staffCan(staff, "candidates.verify"),
    open: staffCan(staff, "candidates.view_documents"),
    contact: staffCan(staff, "candidates.view_contact"),
    manage: staffCan(staff, "candidates.manage"),
    attribution: staffCan(staff, "partners.manage"),
  };
  const [applications, assessments, flags, attributions, enrolments, jobs, batches, owners] = await Promise.all([
    can.recruitment ? applicationsForCandidate(id) : Promise.resolve([]),
    can.assess ? listSkillAssessments(staff, { candidateId: id }, { page: 1, pageSize: 50, offset: 0 }) : Promise.resolve(null),
    duplicateFlagsForCandidate(id),
    attributionsForCandidate(id),
    can.training ? enrolmentsForCandidate(id) : Promise.resolve([]),
    can.manageRecruitment ? openJobOptions() : Promise.resolve([]),
    can.enrol ? openVenkatSaiBatchOptions() : Promise.resolve([]),
    can.manageRecruitment ? listStaffOptions({ permission: "recruitment.manage" }) : Promise.resolve([]),
  ]);
  // Employer feedback from interviews on the most recent applications (staff see all feedback).
  const feedback = can.recruitment
    ? (
        await Promise.all(
          applications.slice(0, 5).map((a) =>
            getApplicationForStaff(staff, a.id)
              .then((d) => d.interviews.flatMap((i) => i.feedback.map((f) => ({ ...f, round: i.roundName, jobTitle: d.job.title, applicationId: d.application.id }))))
              .catch(() => []),
          ),
        )
      ).flat()
    : [];
  const minor = view.internal?.isMinor ?? false;
  const contact = view.contact;
  const openFlags = flags.filter((f) => f.status === "open");
  const perms = { canVerify: can.verify, canOpen: can.open };

  return (
    <div className="space-y-6">
      <PageHeader
        title={view.name.full ?? view.name.display}
        description={view.headline ?? view.currentJobTitle ?? undefined}
        status={<StatusBadge tone={view.verificationLevel === "none" ? "neutral" : "success"}>{LEVEL_LABELS[view.verificationLevel] ?? humanize(view.verificationLevel)}</StatusBadge>}
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Candidates", href: "/admin/candidates" }, { label: view.name.display }]}
        meta={
          <span className="text-sm text-muted-foreground">
            {[view.location.city, view.location.countryName].filter(Boolean).join(", ") || "Location not given"}
            {view.lastActiveAt ? <> · last active <DateText value={view.lastActiveAt} timeZone={tz} /></> : null}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {can.open ? (
              <>
                <a href={`/admin/candidates/${id}/pack?type=cv`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-surface-subtle" data-testid="candidate-cv-pack">
                  <FileStack aria-hidden="true" className="size-4" /> Download CV pack
                </a>
                <a href={`/admin/candidates/${id}/pack?type=visa`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-surface-subtle" data-testid="candidate-visa-pack">
                  <Stamp aria-hidden="true" className="size-4" /> Download visa pack
                </a>
              </>
            ) : null}
            {can.manageRecruitment ? (
              <FormDialog
                triggerLabel="Assign to job"
                triggerVariant="default"
                icon={<Briefcase aria-hidden="true" />}
                title="Assign to a job"
                description="Creates a Venkat Sai-assigned application. Candidates are never charged to be put forward."
                action={assignToJobFormAction}
                hidden={{ candidateId: id }}
                submitLabel="Assign"
                successHref="/admin/pipeline/{id}"
                testId="assign-to-job"
                fields={[
                  { name: "jobId", label: "Job", kind: "search-select", required: true, options: jobs, hint: minor ? "This candidate is under 18 and cannot be assigned to overseas jobs." : undefined },
                  { name: "consentMethod", label: "How the candidate agreed", kind: "select", required: true, options: [{ value: "verbal", label: "Verbally (phone or in person)" }, { value: "written", label: "In writing" }, { value: "electronic", label: "Electronically (email, message)" }, { value: "in_person", label: "In person at the centre" }], defaultValue: "verbal" },
                  { name: "consentNote", label: "Consent note", optional: true, maxLength: 1000 },
                  { name: "assignedToUserId", label: "Application owner", kind: "search-select", optional: true, options: owners, allowClear: true },
                  { name: "internalNote", label: "Internal note", kind: "textarea", optional: true, rows: 2 },
                  { name: "consentConfirmed", label: "The candidate agreed to be put forward for this job", kind: "checkbox" },
                ]}
              />
            ) : null}
            {can.schedule ? (
              <Link href={`/admin/assessments/new?candidate=${id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-surface-subtle">
                <ClipboardCheck aria-hidden="true" className="size-4" /> Schedule assessment
              </Link>
            ) : null}
            {can.enrol && batches.length ? (
              <FormDialog
                triggerLabel="Enrol in batch"
                icon={<GraduationCap aria-hidden="true" />}
                title="Enrol in a Venkat Sai batch"
                description="Confirmed at once. Course fees are never a condition of an application, offer or placement."
                action={enrolInBatchFormAction}
                hidden={{ candidateId: id }}
                submitLabel="Enrol"
                fields={[{ name: "batchId", label: "Batch", kind: "search-select", required: true, options: batches }]}
              />
            ) : null}
          </div>
        }
      />

      {minor ? (
        <Callout tone="warning" title="Under 18">
          This candidate is a minor. They are excluded from overseas matching and employer search for overseas roles, and need verifiable guardian consent. No tracking or marketing.
        </Callout>
      ) : null}
      {openFlags.length ? <Callout tone="warning" title={`${openFlags.length} possible duplicate record${openFlags.length === 1 ? "" : "s"}`}>Review the duplicate flags below before assigning this candidate.</Callout> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <SectionCard title="Profile">
            <KeyValueList
              columns={2}
              items={[
                { label: "Current role", value: [view.currentJobTitle, view.currentEmployerName].filter(Boolean).join(" at ") || null },
                { label: "Experience", value: view.totalExperienceMonths != null ? `${Math.floor(view.totalExperienceMonths / 12)} years ${view.totalExperienceMonths % 12} months` : null },
                { label: "Availability", value: view.availability ? humanize(view.availability) : null },
                { label: "Notice period", value: view.noticePeriodDays != null ? `${view.noticePeriodDays} days` : null },
                { label: "Preferred roles", value: view.preferences.roles.join(", ") || null },
                { label: "Open to overseas", value: view.preferences.openToOverseas ? "Yes" : "No" },
                { label: "Preferred locations", value: view.preferences.locations.map((l) => [l.city, l.countryName ?? l.countryCode].filter(Boolean).join(", ")).join("; ") || null },
                { label: "Expected salary", value: view.expectedSalary ? <span><MoneyText amountMinor={view.expectedSalary.amountMinor} currency={view.expectedSalary.currency} /> per {view.expectedSalary.period.replace(/ly$/, "")}</span> : null },
                { label: "Passport", value: view.passportStatus ? humanize(view.passportStatus) : null },
                { label: "Visibility", value: view.visibility ? humanize(view.visibility) : null },
                { label: "Summary", value: view.about, fullWidth: true },
              ]}
            />
          </SectionCard>

          <SectionCard title="Skills and languages">
            {view.skills.length ? (
              <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
                {view.skills.map((s) => (
                  <li key={s.skillId} className="rounded-md border border-border px-2 py-0.5 text-xs">
                    {s.name}
                    {s.level ? ` · ${humanize(s.level)}` : ""}
                    {s.verified ? <span className="ml-1 font-medium text-success-strong">· {s.source === "assessment" ? "verified by Venkat Sai assessment" : "verified"}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No skills added.</p>
            )}
            {view.languages.length ? <p className="mt-3 text-sm">Languages: {view.languages.map((l) => `${l.name} (${humanize(l.proficiency)})`).join(", ")}</p> : null}
          </SectionCard>

          <ExperienceSection view={view} perms={perms} />
          <EducationSection view={view} perms={perms} />
          <DocumentsSection view={view} perms={perms} />
          <CredentialsSection view={view} perms={perms} />

          <SectionCard title="Skill assessment history" description="Venkat Sai assessments, labelled with their procedure reference; never presented as accredited certifications." action={can.schedule ? { label: "Schedule", href: `/admin/assessments/new?candidate=${id}` } : undefined}>
            {assessments && assessments.items.length ? (
              <ul className="space-y-2">
                {assessments.items.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Link href={`/admin/assessments/${a.id}`} className="underline-offset-4 hover:underline">
                      {a.trade} · {SKILL_ASSESSMENT_TYPE_LABELS[a.assessmentType]}
                      {a.standardReference ? ` · ${a.standardReference}` : ""} · <DateText value={a.scheduledAt} timeZone={tz} />
                    </Link>
                    <span className="flex gap-1.5">
                      <StatusBadge tone={statusTone(a.status)} size="sm">{humanize(a.status)}</StatusBadge>
                      {a.result !== "pending" ? <StatusBadge tone={statusTone(a.result)} size="sm">{`${humanize(a.result)}${a.resultPublishedAt ? "" : " (not published)"}`}</StatusBadge> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No assessments yet.</p>
            )}
          </SectionCard>

          {can.recruitment ? (
            <SectionCard title="Applications" flush>
              {applications.length ? (
                <ul className="divide-y divide-border">
                  {applications.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <div className="min-w-0">
                        <Link href={`/admin/pipeline/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                          {a.jobTitle}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {a.employer ?? "Venkat Sai"} · {a.code} · {humanize(a.source)} · updated <DateText value={a.lastStageChangedAt} timeZone={tz} />
                        </p>
                      </div>
                      <StatusBadge tone={statusTone(a.stageCategory)} size="sm">{a.stageName}</StatusBadge>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4">
                  <EmptyState size="sm" variant="plain" title="No applications" description={can.manageRecruitment ? "Use “Assign to job” to put this candidate forward." : undefined} />
                </div>
              )}
            </SectionCard>
          ) : null}

          {can.recruitment ? (
            <SectionCard title="Employer feedback" description="Interview feedback on recent applications. Never shown to the candidate or partners.">
              {feedback.length ? (
                <ul className="space-y-3">
                  {feedback.map((f) => (
                    <li key={f.id} className="rounded-lg border border-border p-3 text-sm">
                      <p className="font-medium">
                        {f.jobTitle} · {f.round}: {RECOMMENDATION_LABELS[f.recommendation]}
                        {f.rating ? ` · ${f.rating}/5` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {f.authorName ?? "Panel member"} · {f.authorOrganizationId ? "Employer" : "Venkat Sai"} · <DateText value={f.updatedAt} timeZone={tz} />
                      </p>
                      {f.strengths ? <p className="mt-1">Strengths: {f.strengths}</p> : null}
                      {f.concerns ? <p className="mt-1">Concerns: {f.concerns}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No feedback yet.</p>
              )}
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          <SectionCard title="Contact" description="Masked by default.">
            {contact.state === "hidden" ? (
              <p className="text-sm text-muted-foreground">Contact details are not available to you.</p>
            ) : (
              <RevealContact candidateId={id} maskedEmail={contact.email} maskedPhone={contact.phone} action={revealContactAction} canReveal={contact.state === "masked" && can.contact} />
            )}
          </SectionCard>
          <SectionCard title="Identity details">
            <RevealIdentity candidateId={id} available={view.identityAvailable && can.open} action={revealIdentityAction} />
          </SectionCard>
          <SectionCard title="Record">
            {view.internal ? (
              <div className="flex items-start gap-4">
                <ProgressRing value={view.internal.profileCompleteness} label="Profile completeness" size="sm" />
                <KeyValueList
                  items={[
                    { label: "Source", value: humanize(view.internal.source) },
                    { label: "Created", value: <DateText value={view.internal.createdAt} timeZone={tz} /> },
                    { label: "References may be contacted", value: view.internal.referencesConsent ? "Yes" : "No" },
                    { label: "Shares assessment results", value: view.internal.assessmentSharingConsent ? "Yes" : "No" },
                  ]}
                />
              </div>
            ) : null}
            {view.resume && can.open ? (
              <div className="mt-3">
                <OpenDocumentButton candidateId={id} fileId={view.resume.id} label="resume" action={openDocumentAction} />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Duplicate flags" description="Possible duplicate records. Combining records is handled by the candidates team.">
            {flags.length ? (
              <ul className="space-y-3">
                {flags.map((f) => (
                  <li key={f.id} className="text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/admin/candidates/${f.possibleDuplicateCandidateId}`} className="font-medium underline-offset-4 hover:underline">
                        {f.otherName ?? "Candidate"}
                      </Link>
                      <StatusBadge tone={f.status === "open" ? "warning" : statusTone(f.status)} size="sm">{humanize(f.status)}</StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Matched on {f.matchedOn.map(humanize).join(", ")}
                      {f.score != null ? ` · score ${f.score}` : ""}
                    </p>
                    {f.status === "open" && can.manage ? (
                      <div className="mt-1.5">
                        <ReasonDialog action={resolveDuplicateFlagFormAction} hidden={{ flagId: f.id }} triggerLabel="Resolve" title="Resolve this duplicate flag" confirmLabel="Save decision" reasonName="resolutionNotes" reasonLabel="Resolution notes" reasonRequired={false} choice={{ name: "status", label: "Decision", options: FLAG_CHOICES, required: true }} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No duplicate flags.</p>
            )}
          </SectionCard>

          <SectionCard title="Partner attribution">
            {attributions.length ? (
              <ul className="space-y-3">
                {attributions.map((at) => (
                  <li key={at.id} className="text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{at.partnerName ?? "Partner"}</span>
                      <StatusBadge tone={at.status === "disputed" ? "warning" : statusTone(at.status)} size="sm">{humanize(at.status)}</StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      From <DateText value={at.firstSubmittedAt} timeZone={tz} />
                      {at.expiresAt ? <> to <DateText value={at.expiresAt} timeZone={tz} /></> : null}
                    </p>
                    {can.attribution && (at.status === "active" || at.status === "disputed") ? (
                      <div className="mt-1.5">
                        <ReasonDialog action={updateAttributionFormAction} hidden={{ attributionId: at.id }} triggerLabel="Update" title="Update attribution" confirmLabel="Save" reasonName="resolutionNotes" reasonLabel="Resolution notes" choice={{ name: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "disputed", label: "Disputed" }, { value: "revoked", label: "Revoked" }, { value: "expired", label: "Expired" }], defaultValue: at.status, required: true }} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{view.internal?.source === "partner" ? "Sourced by a partner; no active attribution." : "Not attributed to a partner."}</p>
            )}
          </SectionCard>

          {can.training ? (
            <SectionCard title="Training">
              {enrolments.length ? (
                <ul className="space-y-2 text-sm">
                  {enrolments.map((e) => (
                    <li key={e.id}>
                      <Link href={`/admin/training/batches/${e.batchId}`} className="underline-offset-4 hover:underline">
                        {e.courseTitle} · {e.batchTitle}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {e.provider ?? "Venkat Sai"} · {humanize(e.status)}
                        {e.resultStatus !== "pending" ? ` · ${humanize(e.resultStatus)}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No enrolments.</p>
              )}
            </SectionCard>
          ) : null}

          <InternalNotesPanel ctx={staff} entityType="candidate" entityId={id} title="Internal notes" />
        </div>
      </div>
    </div>
  );
}
