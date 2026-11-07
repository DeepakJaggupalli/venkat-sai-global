import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { AssessmentsPanel } from "@/components/institution/assessments-panel";
import { AttendanceTaker } from "@/components/institution/attendance-taker";
import { BatchInstructors, BatchStatusActions } from "@/components/institution/batch-controls";
import { EnrolmentActions } from "@/components/institution/enrolment-actions";
import { batchStatus, COURSE_MODE_LABELS, ENROLMENT_STATUS_LABELS, enrolmentStatus, pct, resultStatus } from "@/components/institution/labels";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireOrgMember } from "@/modules/identity/authz";
import { listMemberOptions } from "@/modules/organizations/members";
import { getAttendanceRegister } from "@/modules/training/attendance";
import { listCourseModules } from "@/modules/training/courses";
import { getBatchGradebook } from "@/modules/training/grading";
import { getBatchForActor, listBatchEnrolments } from "@/modules/training/queries";

import { orNotFound } from "../../_lib/load";
import { oneOf, param, uuidParam, type SearchParams } from "../../_lib/params";

export const metadata: Metadata = { title: "Batch" };

const TABS = ["overview", "learners", "attendance", "assessments"] as const;
const ACTIVE_LEARNER = new Set(["confirmed", "in_progress", "completed"]);

export default async function InstitutionBatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("institution", ["institution.batches.manage", "institution.students.manage", "institution.assessments.manage"], "any");
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const sp = await searchParams;
  const tab = oneOf(param(sp, "tab"), TABS) ?? "overview";
  const can = {
    manage: ctx.permissions.has("institution.batches.manage"),
    students: ctx.permissions.has("institution.students.manage"),
    grading: ctx.permissions.has("institution.assessments.manage"),
  };
  const { batch, course, instructors, enrolmentCounts } = await orNotFound(getBatchForActor(ctx, id));
  const enrolments = await listBatchEnrolments(ctx, batch.id);
  const learners = enrolments.filter((e) => ACTIVE_LEARNER.has(e.status));
  const status = batchStatus(batch.status);
  const base = `/institution/batches/${batch.id}`;
  const timeZone = ctx.user.timezone ?? undefined;

  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}?tab=learners`, label: "Learners", count: enrolments.length },
    ...(can.students ? [{ href: `${base}?tab=attendance`, label: "Attendance" }] : []),
    ...(can.grading ? [{ href: `${base}?tab=assessments`, label: "Assessments and results" }] : []),
  ];

  let body: ReactNode = null;
  if (tab === "attendance" && can.students) {
    const [register, modules] = await Promise.all([getAttendanceRegister(ctx, batch.id), listCourseModules(course.id)]);
    const records: Record<string, Record<string, "present" | "late" | "absent" | "excused">> = {};
    for (const r of register.records) (records[r.sessionId] ??= {})[r.enrolmentId] = r.status;
    body = (
      <SectionCard title="Attendance" description="Take attendance on your phone in class. Attendance % counts present and late, and leaves out excused sessions.">
        <AttendanceTaker
          batchId={batch.id}
          sessions={register.sessions.map((s) => ({ id: s.id, sessionDate: s.sessionDate, topic: s.topic }))}
          learners={learners.filter((l) => l.status !== "completed").map((l) => ({ enrolmentId: l.id, name: l.candidateName }))}
          records={records}
          moduleOptions={modules.map((m) => ({ value: m.id, label: m.title }))}
          canManageSessions={batch.status !== "cancelled"}
        />
      </SectionCard>
    );
  } else if (tab === "assessments" && can.grading) {
    const book = await getBatchGradebook(ctx, batch.id);
    body = (
      <SectionCard title="Assessments and results">
        <AssessmentsPanel
          batchId={batch.id}
          canResults={can.grading}
          assessments={book.assessments.map((a) => ({
            id: a.id,
            title: a.title,
            type: a.type,
            maxScore: a.maxScore,
            passScore: a.passScore,
            weightPercent: a.weightPercent,
            scheduledAt: a.scheduledAt?.toISOString() ?? null,
            published: Boolean(a.resultsPublishedAt),
          }))}
          scores={book.scores.map((s) => ({ assessmentId: s.assessmentId, enrolmentId: s.enrolmentId, score: s.score, isAbsent: s.isAbsent, remarks: s.remarks }))}
          learners={learners.map((l) => ({ enrolmentId: l.id, name: l.candidateName, resultStatus: l.resultStatus, finalScore: l.finalScore }))}
        />
      </SectionCard>
    );
  } else if (tab === "learners") {
    body = (
      <SectionCard
        title="Learners"
        description="Applying to a batch shares the learner's name, email and phone with your institution. Use them only for this training."
        action={{ label: "Open in students", href: `/institution/students?batch=${batch.id}` }}
        flush
      >
        <DataTable
          caption={`Learners of ${batch.title}`}
          rows={enrolments}
          getRowId={(e) => e.id}
          columns={[
            {
              id: "name",
              header: "Learner",
              primary: true,
              cell: (e) => (
                <span className="block min-w-0">
                  <span className="block font-medium text-foreground">{e.candidateName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[e.email, e.phone].filter(Boolean).join(" · ")}</span>
                </span>
              ),
            },
            {
              id: "status",
              header: "Status",
              cell: (e) => (
                <StatusBadge tone={enrolmentStatus(e.status).tone} size="sm">
                  {enrolmentStatus(e.status).label}
                </StatusBadge>
              ),
            },
            { id: "attendance", header: "Attendance", hideOnMobile: true, align: "right", cell: (e) => pct(e.attendancePercent) },
            {
              id: "result",
              header: "Result",
              hideOnMobile: true,
              cell: (e) => (
                <StatusBadge tone={resultStatus(e.resultStatus).tone} size="sm">
                  {resultStatus(e.resultStatus).label}
                </StatusBadge>
              ),
            },
            { id: "applied", header: "Applied", hideOnMobile: true, cell: (e) => <DateText value={e.appliedAt} timeZone={timeZone} /> },
            { id: "actions", header: <span className="sr-only">Actions</span>, align: "right", cell: (e) => (can.students ? <EnrolmentActions enrolment={{ id: e.id, status: e.status, candidateName: e.candidateName, feeStatus: e.feeStatus }} /> : null) },
          ]}
          empty={
            <div className="p-5">
              <EmptyState size="sm" variant="plain" title="No applications yet" description={batch.status === "planned" ? "Open the batch for enrolment so learners can apply." : "Applications appear here as learners apply."} />
            </div>
          }
        />
      </SectionCard>
    );
  } else {
    const memberOptions = can.manage ? await listMemberOptions(ctx, ctx.organization.id) : [];
    body = (
      <div className="space-y-6">
        <StatGrid columns={4}>
          <StatCard label="Seats taken" value={batch.capacity ? `${batch.enrolledCount} / ${batch.capacity}` : batch.enrolledCount} hint={batch.capacity ? undefined : "No seat limit"} />
          <StatCard label="Applications to review" value={enrolmentCounts.applied} href={`${base}?tab=learners`} />
          <StatCard label="Waitlisted" value={enrolmentCounts.waitlisted} />
          <StatCard label="Completed" value={enrolmentCounts.completed} hint={`${enrolmentCounts.dropped} dropped out`} />
        </StatGrid>
        {can.manage ? (
          <SectionCard title="Status">
            <BatchStatusActions batchId={batch.id} status={batch.status} />
            {batch.status === "planned" && course.status !== "published" ? (
              <p className="mt-3 text-sm text-muted-foreground">The course must be published before this batch can open for enrolment.</p>
            ) : null}
          </SectionCard>
        ) : null}
        <SectionCard title="Details" action={can.manage && !["completed", "cancelled"].includes(batch.status) ? { label: "Edit batch", href: `${base}/edit` } : undefined}>
          <KeyValueList
            columns={2}
            items={[
              { label: "Course", value: course.title },
              { label: "Dates", value: batch.startsOn ? <span><DateText value={batch.startsOn} dateOnly />{batch.endsOn ? <> to <DateText value={batch.endsOn} dateOnly /></> : null}</span> : null },
              { label: "Registration closes", value: batch.registrationDeadline ? <DateText value={batch.registrationDeadline} dateOnly /> : null },
              { label: "Timetable", value: batch.schedule, hint: batch.timezone ?? undefined },
              { label: "Delivery", value: COURSE_MODE_LABELS[batch.mode] },
              { label: "Venue", value: [batch.venue, batch.city, batch.countryCode].filter(Boolean).join(", ") || null },
            ]}
          />
        </SectionCard>
        <SectionCard title="Instructors" description="Team members added here can take attendance and enter scores for this batch only.">
          <BatchInstructors
            batchId={batch.id}
            editable={can.manage && batch.status !== "cancelled"}
            memberOptions={memberOptions.map((m) => ({ value: m.userId, label: `${m.displayName} · ${m.roleName}` }))}
            instructors={instructors.map((i) => ({ id: i.id, name: i.name, role: i.role, bio: i.bio, isPlatformUser: Boolean(i.userId) }))}
          />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={batch.code}
        title={batch.title}
        description={course.title}
        status={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Batches", href: "/institution/batches" }, { label: batch.title }]}
        meta={
          <span className="text-sm text-muted-foreground">
            {Object.entries(enrolmentCounts)
              .filter(([, n]) => n > 0)
              .map(([s, n]) => `${n} ${ENROLMENT_STATUS_LABELS[s as keyof typeof ENROLMENT_STATUS_LABELS].toLowerCase()}`)
              .join(" · ") || "No learners yet"}
          </span>
        }
      />
      {batch.status === "cancelled" ? (
        <Callout tone="danger" title="This batch was cancelled">
          {batch.cancellationReason ?? "Learners were notified."}
        </Callout>
      ) : null}
      <LinkTabs label="Batch sections" items={tabs} />
      {body}
    </div>
  );
}
