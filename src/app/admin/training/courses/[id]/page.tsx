import { Archive, RotateCcw, Send, Star, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/admin/action-button";
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
import { requireStaff, staffCan } from "@/modules/identity/authz";
import {
  addCourseModuleAction,
  archiveCourseAction,
  createBatchAction,
  deleteCourseAction,
  removeCourseModuleAction,
  restoreCourseAction,
  submitCourseAction,
  updateCourseAction,
} from "@/modules/training/actions";
import { BATCH_STATUS_LABELS, COURSE_CATEGORY_LABELS, COURSE_CERTIFICATION_TYPE_LABELS, COURSE_FEE_TYPE_LABELS, COURSE_MODE_LABELS } from "@/modules/training/constants";
import { getCourseForActor, listBatches } from "@/modules/training/queries";
import { setCourseFeaturedAction } from "@/modules/training/staff-actions";

import { isUuid, orNotFound, staffTimeZone } from "../../../pipeline/_shared/server";
import { StaffForm } from "../../../pipeline/_shared/staff-form";
import { humanize, statusTone } from "../../../pipeline/_shared/status";
import { batchFields } from "../../_lib/batch-fields";
import { courseFields } from "../../_lib/course-fields";
import { providerName } from "../../_lib/queries";

export const metadata: Metadata = { title: "Course · Training" };

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(["training.view", "training.manage"], "any");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { course, modules, latestDecision } = await orNotFound(getCourseForActor(staff, id));
  const tz = staffTimeZone(staff);
  const canManage = staffCan(staff, "training.manage");
  const isOwn = !course.organizationId;
  const editable = canManage && isOwn && course.status !== "archived";
  const [batches, provider, editFields, newBatchFields] = await Promise.all([
    listBatches(staff, { courseId: course.id }, { page: 1, pageSize: 50, offset: 0 }),
    providerName(course.organizationId),
    editable ? courseFields(course) : Promise.resolve([]),
    editable ? batchFields(null, { timeZone: tz }) : Promise.resolve([]),
  ]);
  const canPublish = isOwn && (course.status === "draft" || course.status === "changes_requested" || course.status === "rejected");

  return (
    <div className="space-y-6">
      <PageHeader
        title={course.title}
        eyebrow={<span className="font-mono">{course.code}</span>}
        status={<StatusBadge tone={statusTone(course.status)}>{humanize(course.status)}</StatusBadge>}
        description={`${provider} · ${COURSE_CATEGORY_LABELS[course.category]} · ${COURSE_MODE_LABELS[course.mode]}`}
        breadcrumbs={[
          { label: "Command Centre", href: "/admin" },
          { label: "Training", href: "/admin/training" },
          { label: "Courses", href: "/admin/training/courses" },
          { label: course.title },
        ]}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              {canPublish ? (
                <ActionButton variant="default" icon={<Send aria-hidden="true" />} action={submitCourseAction.bind(null, { via: "admin", courseId: course.id })} testId="publish-course">
                  Publish
                </ActionButton>
              ) : null}
              {course.status === "published" ? (
                <ActionButton icon={<Star aria-hidden="true" />} action={setCourseFeaturedAction.bind(null, { courseId: course.id, isFeatured: !course.isFeatured })}>
                  {course.isFeatured ? "Remove from featured" : "Feature in catalogue"}
                </ActionButton>
              ) : null}
              {isOwn && course.status !== "archived" ? (
                <ActionButton
                  icon={<Archive aria-hidden="true" />}
                  action={archiveCourseAction.bind(null, { via: "admin", courseId: course.id })}
                  confirm={{ title: "Archive this course?", description: "It leaves the catalogue. Existing batches and certificates are kept.", confirmLabel: "Archive" }}
                >
                  Archive
                </ActionButton>
              ) : null}
              {isOwn && course.status === "archived" ? (
                <ActionButton icon={<RotateCcw aria-hidden="true" />} action={restoreCourseAction.bind(null, { via: "admin", courseId: course.id })}>
                  Restore as draft
                </ActionButton>
              ) : null}
              {isOwn && batches.total === 0 ? (
                <ActionButton
                  variant="destructive"
                  icon={<Trash2 aria-hidden="true" />}
                  action={deleteCourseAction.bind(null, { via: "admin", courseId: course.id })}
                  confirm={{ title: "Delete this course?", description: "Only courses without batches can be deleted. This cannot be undone.", confirmLabel: "Delete", destructive: true }}
                >
                  Delete
                </ActionButton>
              ) : null}
            </div>
          ) : undefined
        }
      />

      {latestDecision && latestDecision.status !== "approved" && latestDecision.reason ? (
        <Callout tone="warning" title={`Latest review: ${humanize(latestDecision.status)}`}>
          {latestDecision.reason}
        </Callout>
      ) : null}
      {!isOwn ? (
        <Callout tone="info" title="Institution course" action={{ label: "Open approvals", href: "/admin/approvals?type=course_publication" }}>
          Publication of institution courses is decided in the approval centre. The institution edits the course in its own portal.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <SectionCard title="Overview">
            <KeyValueList
              columns={2}
              items={[
                { label: "Certification", value: COURSE_CERTIFICATION_TYPE_LABELS[course.certificationType] },
                { label: "Awarding body", value: course.accreditationBody },
                {
                  label: "Duration",
                  value: [course.durationHours ? `${course.durationHours} hours` : null, course.durationWeeks ? `${course.durationWeeks} weeks` : null].filter(Boolean).join(" · ") || null,
                },
                {
                  label: "Fee",
                  value:
                    course.feeType === "fixed" && course.feeMinor != null && course.feeCurrency ? (
                      <MoneyText amountMinor={course.feeMinor} currency={course.feeCurrency} />
                    ) : (
                      COURSE_FEE_TYPE_LABELS[course.feeType]
                    ),
                },
                { label: "Languages", value: course.languageCodes.length ? course.languageCodes.join(", ").toUpperCase() : null },
                { label: "Published", value: course.publishedAt ? <DateText value={course.publishedAt} timeZone={tz} /> : null },
                { label: "Eligibility", value: course.eligibility, fullWidth: true },
                {
                  label: "Outcomes",
                  value: course.outcomes.length ? (
                    <ul className="list-disc pl-5">
                      {course.outcomes.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  ) : null,
                  fullWidth: true,
                },
              ]}
            />
            {course.descriptionHtml ? (
              <div className="mt-4">
                <SafeHtml html={course.descriptionHtml} />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Syllabus" description={`${modules.length} module${modules.length === 1 ? "" : "s"}`}>
            {modules.length ? (
              <ol className="space-y-3">
                {modules.map((m, i) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {i + 1}. {m.title}
                      </p>
                      {m.description ? <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{m.description}</p> : null}
                      {m.durationHours ? <p className="mt-1 text-xs text-muted-foreground">{m.durationHours} hours</p> : null}
                    </div>
                    {editable ? (
                      <ActionButton
                        variant="ghost"
                        action={removeCourseModuleAction.bind(null, { via: "admin", moduleId: m.id })}
                        confirm={{ title: `Remove “${m.title}”?`, confirmLabel: "Remove", destructive: true }}
                      >
                        Remove
                      </ActionButton>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState size="sm" variant="plain" title="No modules yet" description="A course needs at least one module before it can be published." />
            )}
            {editable ? (
              <div className="mt-5 border-t border-border pt-5">
                <h3 className="mb-3 font-heading text-sm font-semibold">Add a module</h3>
                <StaffForm
                  action={addCourseModuleAction}
                  hidden={{ via: "admin", courseId: course.id }}
                  resetOnSuccess
                  submitLabel="Add module"
                  columns={2}
                  fields={[
                    { name: "title", label: "Module title", required: true, maxLength: 200 },
                    { name: "durationHours", label: "Hours", kind: "number", optional: true, min: 0.25, step: "0.25" },
                    { name: "description", label: "Description", kind: "textarea", optional: true, rows: 2 },
                  ]}
                />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Batches" flush>
            <DataTable
              caption="Batches of this course"
              rows={batches.items}
              getRowId={(b) => b.id}
              rowLink={(b) => ({ href: `/admin/training/batches/${b.id}`, label: `Open batch ${b.title}` })}
              columns={[
                {
                  id: "title",
                  header: "Batch",
                  primary: true,
                  cell: (b) => (
                    <div>
                      <p className="font-medium">{b.title}</p>
                      <p className="font-mono text-xs text-muted-foreground">{b.code}</p>
                    </div>
                  ),
                },
                { id: "starts", header: "Starts", cell: (b) => (b.startsOn ? <DateText value={b.startsOn} dateOnly /> : "—") },
                { id: "seats", header: "Seats", align: "right", cell: (b) => (b.capacity ? `${b.enrolledCount} / ${b.capacity}` : `${b.enrolledCount}`) },
                { id: "status", header: "Status", cell: (b) => <StatusBadge tone={statusTone(b.status)} size="sm">{BATCH_STATUS_LABELS[b.status]}</StatusBadge> },
              ]}
              empty={<EmptyState size="sm" variant="plain" title="No batches yet" description={editable ? "Schedule the first batch from this page." : "Batches of this course will appear here."} />}
            />
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          {editable ? (
            <SectionCard title="Schedule a batch" description="Batches start as planned. Open them for enrolment once the course is published.">
              <StaffForm action={createBatchAction} hidden={{ via: "admin", courseId: course.id }} fields={newBatchFields} submitLabel="Schedule batch" successHref="/admin/training/batches/{id}" testId="batch-form" />
            </SectionCard>
          ) : null}
          {editable ? (
            <SectionCard title="Edit course">
              <StaffForm action={updateCourseAction} hidden={{ via: "admin", courseId: course.id }} fields={editFields} submitLabel="Save course" />
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
