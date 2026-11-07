import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { AddToListDialog } from "@/components/employer-talent/add-to-list-dialog";
import {
  AboutSection,
  AssessmentsSection,
  CredentialsSection,
  DocumentsSection,
  EducationSection,
  ExperienceSection,
  PortfolioSection,
  SkillsSection,
} from "@/components/employer-talent/candidate-profile-sections";
import { ContactPanel } from "@/components/employer-talent/contact-panel";
import { AVAILABILITY_LABELS, formatExperience, formatPlace, labelFor, PASSPORT_STATUS_LABELS } from "@/components/employer-talent/labels";
import { RequestDialog } from "@/components/employer-talent/request-dialog";
import { VerificationLevelBadge } from "@/components/employer-talent/verification-level-badge";
import { EMPLOYMENT_TYPE_LABELS, SALARY_PERIOD_LABELS, WORK_MODE_LABELS } from "@/components/employer/labels";
import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { isUuid } from "@/components/employer-talent/labels";
import { getCandidateView } from "@/modules/candidates/viewer";
import { checkEntitlement } from "@/modules/commercial/entitlements";
import { orgCan, requireOrgMember } from "@/modules/identity/authz";
import { UNLOCK_VALIDITY_DAYS } from "@/modules/recruitment/visibility";

import { loadListChoices } from "../_lib/lists";
import { listListMemberships, listOrgApplicationsForCandidate } from "./_lib/queries";

export const metadata: Metadata = { title: "Candidate profile" };

export default async function EmployerCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgMember("employer", ["employer.candidates.search", "employer.pipeline.view", "employer.candidates.unlock"], "any");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const view = await getCandidateView(id, { kind: "employer", ctx });
  if (!view) notFound();

  const canUnlock = orgCan(ctx, "employer.candidates.unlock");
  const [applications, memberships, listChoices, credits] = await Promise.all([
    orgCan(ctx, "employer.pipeline.view") ? listOrgApplicationsForCandidate(ctx, view.candidateId) : Promise.resolve([]),
    orgCan(ctx, "employer.candidates.lists") ? listListMemberships(ctx, view.candidateId) : Promise.resolve([]),
    loadListChoices(ctx),
    canUnlock && view.contact.state === "hidden" ? checkEntitlement(ctx.organization.id, "candidate_unlocks") : Promise.resolve(null),
  ]);

  const entitled = view.contact.state !== "hidden" || Boolean(view.resume) || view.documents.length > 0;
  const profilePath = `/employer/candidates/${view.candidateId}`;
  const contact = view.contact;
  const title = view.headline ?? view.currentJobTitle ?? "Candidate";

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Find candidates", href: "/employer/candidates" }, { label: view.name.display }]} />
      <PageHeader
        title={view.name.display}
        description={title}
        backLink={{ href: "/employer/candidates", label: "Back to search" }}
        status={<VerificationLevelBadge level={view.verificationLevel} size="md" />}
        meta={
          <span className="text-sm text-muted-foreground">
            {formatPlace(view.location)} · {formatExperience(view.totalExperienceMonths)} experience
            {view.lastActiveAt ? (
              <>
                {" "}
                · last active <DateText value={view.lastActiveAt} />
              </>
            ) : null}
          </span>
        }
      />
      {view.name.masked ? <p className="-mt-3 text-sm text-muted-foreground">The full name is shown after the candidate applies to your job or you unlock the profile.</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <AboutSection view={view} />
          <ExperienceSection view={view} />
          <SkillsSection view={view} />
          <AssessmentsSection view={view} />
          <CredentialsSection view={view} />
          <EducationSection view={view} />
          <PortfolioSection view={view} />
          <DocumentsSection view={view} entitled={entitled} />
        </div>

        <aside className="space-y-6" aria-label="Actions and contact">
          <SectionCard title="Contact details" headingLevel="h2">
            <ContactPanel
              candidateId={view.candidateId}
              state={contact.state}
              masked={contact.state === "hidden" ? { email: null, phone: null } : { email: contact.email, phone: contact.phone }}
              full={contact.state === "full" ? { email: contact.email, phone: contact.phone } : undefined}
              hiddenReason={contact.state === "hidden" ? contact.reason : undefined}
              canUnlock={canUnlock}
              orgVerified={ctx.organization.status === "verified"}
              creditsRemaining={credits?.remaining ?? null}
              creditsEnforced={credits?.enforced ?? false}
              unlockDays={UNLOCK_VALIDITY_DAYS}
            />
          </SectionCard>

          <SectionCard title="Next steps" headingLevel="h2">
            <div className="flex flex-col gap-2">
              {listChoices.canUseLists ? <AddToListDialog candidateIds={[view.candidateId]} lists={listChoices.lists} /> : null}
              <RequestDialog kind="interview" candidateLabel={view.name.display} profilePath={profilePath} />
              <RequestDialog kind="assessment" candidateLabel={view.name.display} profilePath={profilePath} />
              <RequestDialog kind="information" candidateLabel={view.name.display} profilePath={profilePath} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Requests go to the Venkat Sai team, who contact the candidate. Candidates are never charged.</p>
          </SectionCard>

          <SectionCard title="Preferences" headingLevel="h2">
            <KeyValueList
              columns={1}
              dense
              items={[
                { label: "Availability", value: labelFor(AVAILABILITY_LABELS, view.availability, "Not shared") },
                { label: "Notice period", value: view.noticePeriodDays !== null ? `${view.noticePeriodDays} days` : null },
                {
                  label: "Expected salary",
                  value: view.expectedSalary ? (
                    <>
                      <MoneyText amountMinor={view.expectedSalary.amountMinor} currency={view.expectedSalary.currency} /> {labelFor(SALARY_PERIOD_LABELS, view.expectedSalary.period, "").toLowerCase()}
                    </>
                  ) : null,
                },
                { label: "Employment types", value: view.preferences.employmentTypes.map((t) => EMPLOYMENT_TYPE_LABELS[t] ?? t).join(", ") || null },
                { label: "Work modes", value: view.preferences.workModes.map((m) => WORK_MODE_LABELS[m] ?? m).join(", ") || null },
                { label: "Preferred roles", value: view.preferences.roles.join(", ") || null },
                { label: "Overseas work", value: view.preferences.openToOverseas ? "Open to overseas roles" : "Not looking overseas" },
                { label: "Preferred locations", value: view.preferences.locations.map((l) => [l.city, l.countryName ?? l.countryCode].filter(Boolean).join(", ")).join("; ") || null },
                { label: "Passport", value: view.passportStatus ? labelFor(PASSPORT_STATUS_LABELS, view.passportStatus) : null },
              ]}
            />
          </SectionCard>

          {applications.length ? (
            <SectionCard title="Applications to your jobs" headingLevel="h2" description="Notes, feedback and interviews live on each application.">
              <ul className="space-y-3">
                {applications.map((a) => (
                  <li key={a.id} className="space-y-1">
                    <Link href={`/employer/pipeline/${a.jobId}?application=${a.id}`} className="font-medium text-teal-strong underline-offset-4 hover:underline">
                      {a.jobTitle}
                    </Link>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <StatusBadge tone="info" size="sm">
                        {a.stageName}
                      </StatusBadge>
                      {a.code} · applied <DateText value={a.createdAt} />
                    </p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          {memberships.length ? (
            <SectionCard title="On your talent lists" headingLevel="h2" description="Internal to your organisation. Never shown to the candidate.">
              <ul className="space-y-3">
                {memberships.map((m) => (
                  <li key={m.listId} className="space-y-0.5 text-sm">
                    <Link href={`/employer/lists/${m.listId}`} className="font-medium text-teal-strong underline-offset-4 hover:underline">
                      {m.listName}
                    </Link>
                    {m.stage ? <p className="text-xs text-muted-foreground">Status: {m.stage}</p> : null}
                    {m.note ? <p className="whitespace-pre-line text-muted-foreground">{m.note}</p> : null}
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
