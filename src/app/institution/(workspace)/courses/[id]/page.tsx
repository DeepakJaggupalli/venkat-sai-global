import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CourseLifecycleActions, CourseModulesManager } from "@/components/institution/course-actions";
import { batchStatus, COURSE_CATEGORY_LABELS, COURSE_CERTIFICATION_TYPE_LABELS, COURSE_FEE_TYPE_LABELS, COURSE_MODE_LABELS, courseStatus } from "@/components/institution/labels";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { SafeHtml } from "@/components/shared/safe-html";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionError } from "@/lib/actions";
import { getFiles, toFileSummary } from "@/modules/files";
import { requireOrgMember, type OrgContext } from "@/modules/identity/authz";
import { getInstitutionProfile, isAuthorisedIssuerNow } from "@/modules/organizations/institution";
import { getCourseForActor, listBatches } from "@/modules/training/queries";
import { getSkillsByIds, listLanguages } from "@/modules/taxonomy/queries";

import { uuidParam } from "../../_lib/params";

export const metadata: Metadata = { title: "Course" };

async function loadCourse(ctx: OrgContext<"institution">, id: string) {
  try {
    return await getCourseForActor(ctx, id);
  } catch (error) {
    if (error instanceof ActionError && (error.code === "not_found" || error.code === "forbidden")) notFound();
    throw error;
  }
}

export default async function InstitutionCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgMember("institution", "institution.courses.manage");
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const { course, modules, latestDecision } = await loadCourse(ctx, id);
  const timeZone = ctx.user.timezone ?? undefined;
  const materialIds = [...new Set(modules.flatMap((m) => m.materialFileIds))];
  const [batches, materials, skills, languages, profile] = await Promise.all([
    listBatches(ctx, { courseId: course.id }, { page: 1, pageSize: 50, offset: 0 }),
    materialIds.length ? getFiles(materialIds) : Promise.resolve([]),
    course.skillIds.length ? getSkillsByIds(course.skillIds) : Promise.resolve([]),
    listLanguages(),
    getInstitutionProfile(ctx, ctx.organization.id),
  ]);
  const materialById = new Map(materials.map((f) => [f.id, toFileSummary(f)]));
  const status = courseStatus(course.status);
  const editable = course.status !== "archived";
  const authorised = isAuthorisedIssuerNow(profile);
  const canBatches = ctx.permissions.has("institution.batches.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={course.code}
        title={course.title}
        description={course.summary ?? undefined}
        status={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Courses", href: "/institution/courses" }, { label: course.title }]}
        actions={[
          ...(editable ? [{ label: "Edit course", href: `/institution/courses/${course.id}/edit`, variant: "outline" as const }] : []),
          ...(canBatches && course.status !== "archived" ? [{ label: "Schedule a batch", href: `/institution/batches/new?course=${course.id}` }] : []),
        ]}
      />

      {course.status === "changes_requested" || course.status === "rejected" ? (
        <Callout tone={course.status === "rejected" ? "danger" : "warning"} title={course.status === "rejected" ? "Venkat Sai did not approve this course" : "Venkat Sai asked for changes"}>
          {latestDecision?.reason ?? "Update the course and submit it again."}
        </Callout>
      ) : course.status === "pending_approval" ? (
        <Callout tone="info" title="In review">
          Venkat Sai is reviewing this course. Editing it now keeps it in review with your latest changes.
        </Callout>
      ) : null}
      {course.certificationType === "accredited_external" && !authorised ? (
        <Callout tone="warning" title="Accredited certificates need authorisation">
          This course offers an accredited certificate, but your institution is not currently authorised by Venkat Sai as a certificate issuer. It cannot be
          published or issue accredited certificates until it is.
        </Callout>
      ) : null}

      <SectionCard title="Publication">
        <CourseLifecycleActions courseId={course.id} status={course.status} hasBatches={batches.total > 0} />
      </SectionCard>

      <SectionCard title="Course details">
        <KeyValueList
          columns={2}
          items={[
            { label: "Category", value: COURSE_CATEGORY_LABELS[course.category] },
            { label: "Delivery", value: COURSE_MODE_LABELS[course.mode] },
            { label: "Duration", value: [course.durationHours ? `${course.durationHours} hours` : null, course.durationWeeks ? `${course.durationWeeks} weeks` : null].filter(Boolean).join(" · ") || null },
            {
              label: "Fee",
              value:
                course.feeType === "fixed" ? (
                  <MoneyText amountMinor={course.feeMinor} currency={course.feeCurrency} />
                ) : (
                  COURSE_FEE_TYPE_LABELS[course.feeType]
                ),
              hint: course.feeNotes ?? undefined,
            },
            { label: "What learners can earn", value: COURSE_CERTIFICATION_TYPE_LABELS[course.certificationType], hint: course.accreditationBody ? `Awarding body: ${course.accreditationBody}` : undefined },
            { label: "Languages", value: course.languageCodes.map((c) => languages.find((l) => l.code === c)?.name ?? c).join(", ") || null },
            { label: "Skills taught", value: skills.map((s) => s.name).join(", ") || null, fullWidth: true },
            { label: "Eligibility", value: course.eligibility, fullWidth: true },
            { label: "Prerequisites", value: course.prerequisites, fullWidth: true },
            {
              label: "Learning outcomes",
              fullWidth: true,
              value: course.outcomes.length ? (
                <ul className="list-disc space-y-1 pl-5">
                  {course.outcomes.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              ) : null,
            },
            { label: "Published", value: course.publishedAt ? <DateText value={course.publishedAt} timeZone={timeZone} /> : null },
          ]}
        />
        {course.descriptionHtml ? (
          <div className="mt-6 border-t border-border pt-6">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Description</h3>
            <SafeHtml html={course.descriptionHtml} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Syllabus" description="Modules in teaching order. Materials are shared with enrolled learners only.">
        <CourseModulesManager
          courseId={course.id}
          organizationId={ctx.organization.id}
          editable={editable}
          modules={modules.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description,
            durationHours: m.durationHours,
            materials: m.materialFileIds.map((fid) => materialById.get(fid)).filter((f): f is NonNullable<typeof f> => Boolean(f)),
          }))}
        />
      </SectionCard>

      <SectionCard title="Batches" flush action={canBatches && course.status !== "archived" ? { label: "Schedule a batch", href: `/institution/batches/new?course=${course.id}` } : undefined}>
        <DataTable
          caption={`Batches of ${course.title}`}
          rows={batches.items}
          getRowId={(b) => b.id}
          rowLink={(b) => ({ href: `/institution/batches/${b.id}`, label: `Open batch ${b.title}` })}
          columns={[
            { id: "title", header: "Batch", primary: true, cell: (b) => <span className="font-medium">{b.title}</span> },
            { id: "code", header: "Code", hideOnMobile: true, cell: (b) => b.code },
            { id: "starts", header: "Starts", cell: (b) => (b.startsOn ? <DateText value={b.startsOn} dateOnly /> : "Not set") },
            { id: "seats", header: "Seats", align: "right", cell: (b) => (b.capacity ? `${b.enrolledCount} / ${b.capacity}` : b.enrolledCount) },
            {
              id: "status",
              header: "Status",
              cell: (b) => (
                <StatusBadge tone={batchStatus(b.status).tone} size="sm">
                  {batchStatus(b.status).label}
                </StatusBadge>
              ),
            },
          ]}
          empty={
            <div className="p-5">
              <EmptyState size="sm" variant="plain" title="No batches yet" description="Once the course is published, schedule a batch and open it for enrolment." />
            </div>
          }
        />
      </SectionCard>
    </div>
  );
}
