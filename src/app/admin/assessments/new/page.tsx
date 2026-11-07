import type { Metadata } from "next";

import { listStaffOptions } from "@/components/admin/queries";
import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { SearchableSelect } from "@/components/shared/selects";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { sp, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { listAssessmentCentres } from "@/modules/training/centres";
import { SKILL_ASSESSMENT_TYPES, SKILL_ASSESSMENT_TYPE_LABELS } from "@/modules/training/constants";
import { listApplicationsForStaff } from "@/modules/recruitment/queries";

import { requirementOptions } from "../../pipeline/_shared/options";
import { isUuid, staffTimeZone } from "../../pipeline/_shared/server";
import { StaffForm } from "../../pipeline/_shared/staff-form";
import { candidateDisplayNames } from "../../training/_lib/queries";
import { scheduleAssessmentsAction } from "../actions";

export const metadata: Metadata = { title: "Schedule assessments · Assessment centre" };

export default async function ScheduleAssessmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("recruitment.assessments");
  const params = await searchParams;
  const requirementParam = sp(params, "requirement");
  const requirementId = isUuid(requirementParam) ? requirementParam : undefined;
  const candidateParam = sp(params, "candidate");
  const singleCandidateId = isUuid(candidateParam) ? candidateParam : undefined;
  const applicationParam = sp(params, "application");
  const applicationId = isUuid(applicationParam) ? applicationParam : undefined;
  const retestParam = sp(params, "retestOf");
  const retestOfAssessmentId = singleCandidateId && isUuid(retestParam) ? retestParam : undefined;
  const canSeePipeline = staffCan(staff, ["recruitment.view", "recruitment.manage"], "any");

  const [requirements, centres, assessors, applications, singleName] = await Promise.all([
    requirementOptions({ includeIds: requirementId ? [requirementId] : [] }),
    listAssessmentCentres(staff),
    listStaffOptions({ permission: "recruitment.assessments" }),
    requirementId && canSeePipeline ? listApplicationsForStaff(staff, { requirementId, status: "active" }, { page: 1, pageSize: 100, offset: 0 }) : Promise.resolve(null),
    singleCandidateId ? candidateDisplayNames([singleCandidateId]).then((m) => m.get(singleCandidateId) ?? null) : Promise.resolve(null),
  ]);
  const tz = staffTimeZone(staff);
  const centreOptions = centres.map((c) => ({ value: c.id, label: `${c.name}, ${c.city}`, description: c.timezone ?? undefined }));

  const candidateList = singleCandidateId && singleName ? (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Candidate</legend>
      <input type="hidden" name="candidateIds[]" value={singleCandidateId} />
      {applicationId ? <input type="hidden" name="applicationIds[]" value={`${singleCandidateId}:${applicationId}`} /> : null}
      <p className="text-sm">{singleName}</p>
    </fieldset>
  ) : applications && applications.items.length ? (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Candidates on this requirement ({applications.total})</legend>
      <p className="mb-2 text-xs text-muted-foreground">Active applications only. Each selected candidate gets their own assessment and notification.</p>
      <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {applications.items.map((a) => {
          const id = `cand-${a.id}`;
          return (
            <li key={a.id} className="flex items-start gap-2.5">
              <input id={id} type="checkbox" name="candidateIds[]" value={a.candidate.id} className="mt-1 size-4 accent-teal" defaultChecked={a.stage.category === "assessment"} />
              <input type="hidden" name="applicationIds[]" value={`${a.candidate.id}:${a.id}`} />
              <Label htmlFor={id} className="grid gap-0.5 font-normal">
                <span className="font-medium">{a.candidate.displayName}</span>
                <span className="text-xs text-muted-foreground">
                  {a.job.title} · {a.stage.name} · {a.code}
                </span>
              </Label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule assessments"
        description="Schedule a Venkat Sai trade or practical assessment for one candidate or for several candidates of a requirement."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Assessment centre", href: "/admin/assessments" }, { label: "Schedule" }]}
      />
      <Callout tone="info" title="Employer pays">
        Assessments linked to a requirement or application are paid by the employer or Venkat Sai. Candidates are never charged to be trade-tested.
      </Callout>

      {!singleCandidateId ? (
        <SectionCard title="1. Choose the requirement">
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="requirement">Requirement</Label>
              <SearchableSelect id="requirement" name="requirement" options={requirements} defaultValue={requirementId} placeholder="Choose a requirement" />
            </div>
            <Button type="submit" variant="outline">
              Load candidates
            </Button>
          </form>
          {!canSeePipeline ? <p className="mt-3 text-sm text-muted-foreground">You need pipeline access to list a requirement&apos;s candidates. Schedule from a candidate profile instead.</p> : null}
        </SectionCard>
      ) : null}

      {candidateList ? (
        <SectionCard title={singleCandidateId ? "Assessment details" : "2. Assessment details"}>
          <StaffForm
            action={scheduleAssessmentsAction}
            hidden={{ requirementId, retestOfAssessmentId }}
            sendTimeZone
            columns={2}
            submitLabel="Schedule"
            successHref={singleCandidateId ? "/admin/assessments/{id}" : "/admin/assessments?status=scheduled"}
            testId="schedule-assessments-form"
            fields={[
              { name: "trade", label: "Trade", required: true, placeholder: "e.g. Pipe welder", maxLength: 120 },
              { name: "assessmentType", label: "Type", kind: "select", required: true, options: SKILL_ASSESSMENT_TYPES.map((v) => ({ value: v, label: SKILL_ASSESSMENT_TYPE_LABELS[v] })), defaultValue: "trade_test" },
              { name: "scheduledAtLocal", label: "Date and time", kind: "datetime-local", required: true, hint: "In the centre's time zone (or the zone below)." },
              { name: "timezone", label: "Time zone", optional: true, defaultValue: tz, hint: "IANA name, e.g. Asia/Kolkata." },
              { name: "assessmentCentreId", label: "Assessment centre", kind: "search-select", optional: true, options: centreOptions, allowClear: true },
              { name: "location", label: "Or other venue", optional: true, placeholder: "Employer site or video call", maxLength: 300 },
              { name: "process", label: "Process", optional: true, placeholder: "e.g. GTAW root + SMAW fill", maxLength: 120 },
              { name: "position", label: "Position", optional: true, placeholder: "e.g. 6G", maxLength: 60 },
              { name: "standardReference", label: "Procedure / standard reference", optional: true, placeholder: "e.g. WPS-012", hint: "A reference for the procedure followed. It does not imply an external certification.", maxLength: 200 },
              { name: "materialDetails", label: "Material details", optional: true, maxLength: 500 },
              { name: "evaluationMethods", label: "Evaluation methods", kind: "tags", optional: true, hint: "e.g. visual, bend test, radiography", wide: true },
              { name: "assessorUserId", label: "Assessor (team member)", kind: "search-select", optional: true, options: assessors, allowClear: true },
              { name: "assessorName", label: "Or external assessor name", optional: true, maxLength: 120 },
              { name: "maxScore", label: "Maximum score", kind: "number", optional: true, min: 0.01, step: "0.01" },
            ]}
          >
            {candidateList}
          </StaffForm>
        </SectionCard>
      ) : requirementId ? (
        <EmptyState title="No active candidates on this requirement" description="Candidates appear here once they have an active application on one of the requirement's jobs." primaryAction={{ label: "Open pipeline", href: `/admin/pipeline?requirement=${requirementId}` }} />
      ) : singleCandidateId ? (
        <EmptyState title="Candidate not found" description="Open the candidate's profile and try again." primaryAction={{ label: "Search candidates", href: "/admin/candidates" }} />
      ) : null}

      {centres.length === 0 ? (
        <Callout tone="warning" title="No active assessment centres">
          Enter a venue for each assessment, or ask the training team to add a centre.
        </Callout>
      ) : null}
    </div>
  );
}
