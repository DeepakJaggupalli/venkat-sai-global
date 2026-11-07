import type { Metadata } from "next";

import { listStaffOptions } from "@/components/admin/queries";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { SearchableSelect } from "@/components/shared/selects";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { sp, type SearchParams } from "@/lib/http";
import { requireStaff } from "@/modules/identity/authz";
import { INTERVIEW_MODE_LABELS, INTERVIEW_MODE_OPTIONS } from "@/modules/recruitment/constants";
import { getApplicationForStaff, listApplicationsForStaff } from "@/modules/recruitment/queries";

import { isUuid, staffTimeZone } from "../../pipeline/_shared/server";
import { StaffForm } from "../../pipeline/_shared/staff-form";
import { scheduleInterviewFormAction } from "../actions";

export const metadata: Metadata = { title: "Schedule interview · Interviews" };

export default async function ScheduleInterviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("recruitment.manage");
  const params = await searchParams;
  const applicationParam = sp(params, "application");
  const applicationId = isUuid(applicationParam) ? applicationParam : undefined;
  const tz = staffTimeZone(staff);
  const detail = applicationId ? await getApplicationForStaff(staff, applicationId).catch(() => null) : null;
  const [recent, coordinators] = await Promise.all([
    detail ? Promise.resolve(null) : listApplicationsForStaff(staff, { status: "active" }, { page: 1, pageSize: 100, offset: 0 }),
    listStaffOptions({ permission: "recruitment.manage" }),
  ]);
  const nextRound = detail ? detail.interviews.length + 1 : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule an interview"
        description="Schedule on behalf of the employer or as a Venkat Sai interview. The candidate and panel are notified with the time in the interview's time zone."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Interviews", href: "/admin/interviews" }, { label: "Schedule" }]}
      />
      {!detail ? (
        <SectionCard title="Choose the application">
          {recent && recent.items.length ? (
            <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="application">Application</Label>
                <SearchableSelect
                  id="application"
                  name="application"
                  placeholder="Search by candidate or job"
                  options={recent.items.map((a) => ({ value: a.id, label: `${a.candidate.displayName} · ${a.job.title}`, description: `${a.code} · ${a.stage.name}` }))}
                />
              </div>
              <Button type="submit" variant="outline">Continue</Button>
            </form>
          ) : (
            <EmptyState size="sm" variant="plain" title="No active applications" description="Interviews are scheduled for an application." primaryAction={{ label: "Open pipeline", href: "/admin/pipeline" }} />
          )}
          <p className="mt-3 text-xs text-muted-foreground">Showing the 100 most recently updated active applications. For others, start from the application page.</p>
        </SectionCard>
      ) : (
        <SectionCard title={`${detail.candidate.displayName} · ${detail.job.title}`} description={`${detail.application.code} · ${detail.job.organizationName ?? "Venkat Sai"} · current stage ${detail.stage.name}`}>
          <StaffForm
            action={scheduleInterviewFormAction}
            hidden={{ applicationId: detail.application.id }}
            sendTimeZone
            columns={2}
            submitLabel="Schedule interview"
            successHref="/admin/interviews/{id}"
            testId="schedule-interview-form"
            fields={[
              { name: "roundName", label: "Round", required: true, defaultValue: nextRound === 1 ? "Client interview" : `Round ${nextRound}`, maxLength: 120 },
              { name: "roundNumber", label: "Round number", kind: "number", optional: true, min: 1, max: 20, defaultValue: nextRound },
              { name: "mode", label: "Mode", kind: "select", required: true, options: INTERVIEW_MODE_OPTIONS.map((m) => ({ value: m, label: INTERVIEW_MODE_LABELS[m] })), defaultValue: "video" },
              { name: "conductedBy", label: "Conducted by", kind: "select", optional: true, options: [{ value: "employer", label: "Employer" }, { value: "venkat_sai", label: "Venkat Sai" }], defaultValue: detail.job.organizationId ? "employer" : "venkat_sai" },
              { name: "startsAtLocal", label: "Date and time", kind: "datetime-local", required: true },
              { name: "timezone", label: "Time zone", required: true, defaultValue: tz, hint: "IANA name of the interview location, e.g. Asia/Dubai." },
              { name: "durationMinutes", label: "Duration (minutes)", kind: "number", optional: true, min: 5, max: 720, defaultValue: 60 },
              { name: "location", label: "Location", optional: true, maxLength: 500 },
              { name: "meetingUrl", label: "Meeting link", kind: "url", optional: true, placeholder: "https://" },
              { name: "coordinatorUserId", label: "Venkat Sai coordinator", kind: "search-select", optional: true, options: coordinators, allowClear: true },
              { name: "interviewerName", label: "Interviewer name", optional: true, maxLength: 200 },
              { name: "interviewerEmail", label: "Interviewer email", kind: "email", optional: true, hint: "Panel emails are only shown to organisers." },
              { name: "candidateInstructions", label: "Instructions for the candidate", kind: "textarea", optional: true, rows: 3, maxLength: 2000 },
            ]}
          />
        </SectionCard>
      )}
    </div>
  );
}
