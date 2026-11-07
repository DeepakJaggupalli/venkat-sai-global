import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EnrolmentActions } from "@/components/institution/enrolment-actions";
import { batchStatus, ENROLMENT_STATUS_LABELS, enrolmentStatus, FEE_STATUS_LABELS, pct, resultStatus } from "@/components/institution/labels";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, withParams } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";
import { ENROLMENT_STATUSES } from "@/modules/training/constants";
import { getBatchForActor, listBatchEnrolments } from "@/modules/training/queries";

import { orNotFound } from "../_lib/load";
import { oneOf, param, uuidParam, type SearchParams } from "../_lib/params";
import { countInstitutionEnrolmentsByStatus, listCourseOptions, listInstitutionEnrolments, type InstitutionEnrolmentItem } from "../_lib/queries";

export const metadata: Metadata = { title: "Students" };

const TAB_STATUSES = ["applied", "waitlisted", "confirmed", "in_progress", "completed", "dropped", "rejected", "cancelled"] as const;

type Row = Pick<
  InstitutionEnrolmentItem,
  "id" | "status" | "resultStatus" | "feeStatus" | "feeMinor" | "feeCurrency" | "attendancePercent" | "appliedAt" | "candidateName" | "email" | "phone"
> & { batchId: string; batchLabel: string };

export default async function InstitutionStudentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("institution", "institution.students.manage");
  const sp = await searchParams;
  const status = oneOf(param(sp, "status"), ENROLMENT_STATUSES);
  const q = param(sp, "q")?.slice(0, 100);
  const rawBatch = param(sp, "batch");
  const batchId = uuidParam(rawBatch);
  if (rawBatch && !batchId) notFound();
  const timeZone = ctx.user.timezone ?? undefined;

  let rows: Row[];
  let pagination: ReactNode = null;
  let counts: Record<string, number>;
  let batchHeader: { id: string; title: string; code: string; courseTitle: string; status: string } | null = null;
  let courses: { value: string; label: string }[] = [];

  if (batchId) {
    // Notification links (?batch=<id>) land here: scoped to this institution's batch (404 otherwise).
    const detail = await orNotFound(getBatchForActor(ctx, batchId));
    batchHeader = { id: detail.batch.id, title: detail.batch.title, code: detail.batch.code, courseTitle: detail.course.title, status: detail.batch.status };
    const all = await listBatchEnrolments(ctx, batchId);
    counts = detail.enrolmentCounts;
    const needle = q?.toLowerCase();
    rows = all
      .filter((e) => (!status || e.status === status) && (!needle || e.candidateName.toLowerCase().includes(needle)))
      .map((e) => ({ ...e, batchId: detail.batch.id, batchLabel: `${detail.batch.title} (${detail.batch.code})` }));
  } else {
    const courseId = uuidParam(param(sp, "course"));
    const [result, byStatus, courseOptions] = await Promise.all([
      listInstitutionEnrolments(ctx, { status, q, courseId }, parsePage(sp)),
      countInstitutionEnrolmentsByStatus(ctx),
      listCourseOptions(ctx),
    ]);
    counts = byStatus;
    courses = courseOptions;
    rows = result.items.map((e) => ({ ...e, batchLabel: `${e.courseTitle} · ${e.batchTitle} (${e.batchCode})` }));
    pagination = <Pagination pathname="/institution/students" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="enrolments" />;
  }

  const tabBase = (s?: string) => withParams("/institution/students", sp, { status: s ?? null, page: null });
  const tabs = [{ href: tabBase(), label: "All" }, ...TAB_STATUSES.map((s) => ({ href: tabBase(s), label: ENROLMENT_STATUS_LABELS[s], count: counts[s] ?? 0 }))];
  const filtered = Boolean(status || q);

  return (
    <div className="space-y-6">
      <PageHeader
        title={batchHeader ? `Students: ${batchHeader.title}` : "Students"}
        description={
          batchHeader
            ? `${batchHeader.courseTitle} · ${batchHeader.code}`
            : "Applications and enrolments across your batches. Confirm, waitlist or decline applications and track progress."
        }
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Students", href: batchHeader ? "/institution/students" : undefined }, ...(batchHeader ? [{ label: batchHeader.code }] : [])]}
        status={
          batchHeader ? (
            <StatusBadge tone={batchStatus(batchHeader.status).tone}>{batchStatus(batchHeader.status).label}</StatusBadge>
          ) : undefined
        }
        actions={batchHeader ? [{ label: "Open batch", href: `/institution/batches/${batchHeader.id}`, variant: "outline" }] : undefined}
      />

      <Callout tone="neutral" title="Learner contact details">
        Applying to a batch shares the learner&apos;s name, email and phone with your institution. Use them only for this training, and never charge learners to be
        put forward for a job.
      </Callout>

      <LinkTabs label="Enrolment status" items={tabs} />

      <FilterScope>
        <FilterBar paramKeys={batchHeader ? ["q"] : ["q", "course"]} search={<SearchInput label={batchHeader ? "Search learners" : "Search by learner, course or batch"} />}>
          {!batchHeader && courses.length ? <FilterSelect param="course" label="Course" allLabel="All courses" options={courses} /> : null}
        </FilterBar>
        <DataTable
          caption="Enrolments"
          rows={rows}
          getRowId={(r) => r.id}
          columns={[
            {
              id: "learner",
              header: "Learner",
              primary: true,
              cell: (r) => (
                <span className="block min-w-0">
                  <span className="block font-medium text-foreground">{r.candidateName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[r.email, r.phone].filter(Boolean).join(" · ") || "No contact details"}</span>
                </span>
              ),
            },
            ...(batchHeader
              ? []
              : [
                  {
                    id: "batch",
                    header: "Batch",
                    cell: (r: Row) => (
                      <Link href={`/institution/batches/${r.batchId}`} className="text-sm underline-offset-4 hover:underline">
                        {r.batchLabel}
                      </Link>
                    ),
                  },
                ]),
            {
              id: "status",
              header: "Status",
              cell: (r) => (
                <StatusBadge tone={enrolmentStatus(r.status).tone} size="sm">
                  {enrolmentStatus(r.status).label}
                </StatusBadge>
              ),
            },
            {
              id: "fee",
              header: "Fee",
              hideOnMobile: true,
              cell: (r) =>
                r.feeStatus === "not_applicable" ? (
                  FEE_STATUS_LABELS.not_applicable
                ) : (
                  <span className="block">
                    <MoneyText amountMinor={r.feeMinor} currency={r.feeCurrency} fallback="On request" />
                    <span className="block text-xs text-muted-foreground">{FEE_STATUS_LABELS[r.feeStatus]}</span>
                  </span>
                ),
            },
            { id: "attendance", header: "Attendance", hideOnMobile: true, align: "right", cell: (r) => pct(r.attendancePercent) },
            {
              id: "result",
              header: "Result",
              hideOnMobile: true,
              cell: (r) => (
                <StatusBadge tone={resultStatus(r.resultStatus).tone} size="sm">
                  {resultStatus(r.resultStatus).label}
                </StatusBadge>
              ),
            },
            { id: "applied", header: "Applied", hideOnMobile: true, cell: (r) => <DateText value={r.appliedAt} timeZone={timeZone} /> },
            {
              id: "actions",
              header: <span className="sr-only">Actions</span>,
              align: "right",
              cell: (r) => <EnrolmentActions enrolment={{ id: r.id, status: r.status, candidateName: r.candidateName, feeStatus: r.feeStatus }} />,
            },
          ]}
          empty={
            filtered ? (
              <EmptyState title="No enrolments match" description="Try another status or search term." primaryAction={{ label: "Clear filters", href: batchHeader ? `/institution/students?batch=${batchHeader.id}` : "/institution/students", variant: "outline" }} />
            ) : (
              <EmptyState
                icon={<Users aria-hidden="true" />}
                title="No applications yet"
                description="Learners apply from your published course pages once a batch is open for enrolment."
                primaryAction={{ label: "View batches", href: "/institution/batches" }}
              />
            )
          }
          footer={pagination}
        />
      </FilterScope>
    </div>
  );
}
