import { BookOpen, GraduationCap, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";

import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { BATCH_STATUS_LABELS } from "@/modules/training/constants";
import { getTrainingOverview, listBatches, listCourses } from "@/modules/training/queries";

import { staffTimeZone } from "../pipeline/_shared/server";
import { statusTone } from "../pipeline/_shared/status";
import { TrainingTabs } from "./_components/training-tabs";

export const metadata: Metadata = { title: "Training" };

export default async function TrainingOverviewPage() {
  const staff = await requireStaff(["training.view", "training.manage"], "any");
  const tz = staffTimeZone(staff);
  const [overview, pending, batches] = await Promise.all([
    getTrainingOverview(staff),
    listCourses(staff, { status: "pending_approval" }, { page: 1, pageSize: 5, offset: 0 }),
    listBatches(staff, { status: "open" }, { page: 1, pageSize: 8, offset: 0 }),
  ]);
  const canManage = staffCan(staff, "training.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training"
        description="Oversight of every course, batch, enrolment and certificate on the platform, and management of Venkat Sai's own training."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Training" }]}
        actions={canManage ? [{ label: "New Venkat Sai course", href: "/admin/training/courses/new" }] : undefined}
      />
      <TrainingTabs />
      <StatGrid columns={4}>
        <StatCard label="Published courses" value={overview.publishedCourses} icon={<BookOpen aria-hidden="true" />} href="/admin/training/courses?status=published" />
        <StatCard label="Courses awaiting review" value={overview.pendingCourses} icon={<ShieldCheck aria-hidden="true" />} href="/admin/approvals?type=course_publication" />
        <StatCard label="Batches open for enrolment" value={overview.openBatches} icon={<GraduationCap aria-hidden="true" />} href="/admin/training/batches?status=open" />
        <StatCard label="Active learners" value={overview.activeLearners} icon={<Users aria-hidden="true" />} hint={`${overview.activeCertificates} active certificates`} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Institution courses awaiting review" description="Decided in the approval centre." flush action={{ label: "Open approvals", href: "/admin/approvals" }}>
          <DataTable
            caption="Courses awaiting review"
            rows={pending.items}
            getRowId={(c) => c.id}
            rowLink={(c) => ({ href: `/admin/training/courses/${c.id}`, label: `Open ${c.title}` })}
            columns={[
              { id: "title", header: "Course", primary: true, cell: (c) => <span className="font-medium">{c.title}</span> },
              { id: "code", header: "Code", cell: (c) => <span className="font-mono text-xs">{c.code}</span> },
              { id: "updated", header: "Updated", cell: (c) => <DateText value={c.updatedAt} timeZone={tz} /> },
            ]}
            empty={<EmptyState size="sm" variant="plain" title="Nothing to review" description="Institution courses submitted for publication will appear here." />}
          />
        </SectionCard>
        <SectionCard title="Batches open for enrolment" flush action={{ label: "All batches", href: "/admin/training/batches" }}>
          <DataTable
            caption="Open batches"
            rows={batches.items}
            getRowId={(b) => b.id}
            rowLink={(b) => ({ href: `/admin/training/batches/${b.id}`, label: `Open batch ${b.title}` })}
            columns={[
              { id: "title", header: "Batch", primary: true, cell: (b) => (<div><p className="font-medium">{b.title}</p><p className="text-xs text-muted-foreground">{b.courseTitle}</p></div>) },
              { id: "starts", header: "Starts", cell: (b) => (b.startsOn ? <DateText value={b.startsOn} dateOnly /> : "—") },
              { id: "seats", header: "Seats", align: "right", cell: (b) => (b.capacity ? `${b.enrolledCount} / ${b.capacity}` : `${b.enrolledCount}`) },
              { id: "status", header: "Status", cell: (b) => <StatusBadge tone={statusTone(b.status)} size="sm">{BATCH_STATUS_LABELS[b.status]}</StatusBadge> },
            ]}
            empty={<EmptyState size="sm" variant="plain" title="No open batches" description="Batches open for enrolment will appear here." primaryAction={canManage ? { label: "Schedule a batch", href: "/admin/training/courses?provider=venkat_sai" } : undefined} />}
          />
        </SectionCard>
      </div>
    </div>
  );
}
