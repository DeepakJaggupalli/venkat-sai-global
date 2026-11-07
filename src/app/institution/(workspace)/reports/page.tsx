import type { Metadata } from "next";
import { BarChart3, Download } from "lucide-react";

import { courseStatus, pct, ratio } from "@/components/institution/labels";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { requireOrgMember } from "@/modules/identity/authz";

import { getCourseReport, getOutcomeRates } from "../_lib/queries";
import { reportRates } from "../_lib/report";

export const metadata: Metadata = { title: "Reports" };

export default async function InstitutionReportsPage() {
  const ctx = await requireOrgMember("institution", "institution.reports.view");
  const [rows, rates] = await Promise.all([getCourseReport(ctx), getOutcomeRates(ctx)]);
  const totals = rows.reduce(
    (t, r) => ({ completed: t.completed + r.completed, dropped: t.dropped + r.dropped, passed: t.passed + r.passed, failed: t.failed + r.failed }),
    { completed: 0, dropped: 0, passed: 0, failed: 0 },
  );
  const completionRate = ratio(totals.completed, totals.completed + totals.dropped);
  const passRate = ratio(totals.passed, totals.passed + totals.failed);
  const placementRate = rates.placements.completedLearners ? ratio(Math.min(rates.placements.placedLearners, rates.placements.completedLearners), rates.placements.completedLearners) : null;
  const attendanceRate = ratio(rates.attendance.attended, rates.attendance.counted);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        description="Completion, pass and placement rates from your live records. Rates leave out learners whose outcome is not decided yet."
        breadcrumbs={[{ label: "Institution", href: "/institution" }, { label: "Reports" }]}
        actions={
          rows.length ? (
            <Button variant="outline" asChild>
              {/* Plain link (no prefetch): the export is a route handler that returns a file. */}
              <a href="/institution/reports/export" download>
                <Download aria-hidden="true" /> Download CSV
              </a>
            </Button>
          ) : undefined
        }
      />

      <StatGrid columns={4}>
        <StatCard label="Completion rate" value={completionRate === null ? null : pct(completionRate)} hint={`${totals.completed} completed, ${totals.dropped} dropped out`} />
        <StatCard label="Pass rate" value={passRate === null ? null : pct(passRate)} hint={`${totals.passed} passed, ${totals.failed} not passed`} />
        <StatCard
          label="Placement rate"
          value={placementRate === null ? null : pct(placementRate)}
          hint={`${rates.placements.placedLearners} of ${rates.placements.completedLearners} completed learners placed (${rates.placements.verifiedLearners} verified by Venkat Sai)`}
        />
        <StatCard label="Attendance rate" value={attendanceRate === null ? null : pct(attendanceRate)} hint="Present or late, excused sessions not counted" />
      </StatGrid>

      <SectionCard title="By course" description="Placements are counted per learner and include self-reported outcomes until Venkat Sai verifies them." flush>
        <DataTable
          caption="Outcomes by course"
          rows={rows}
          getRowId={(r) => r.courseId}
          rowLink={(r) => ({ href: `/institution/courses/${r.courseId}`, label: `Open ${r.title}` })}
          mobile="cards"
          columns={[
            {
              id: "course",
              header: "Course",
              primary: true,
              cell: (r) => (
                <span className="block min-w-0">
                  <span className="block font-medium text-foreground">{r.title}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {r.code}
                    <StatusBadge tone={courseStatus(r.status).tone} size="sm">
                      {courseStatus(r.status).label}
                    </StatusBadge>
                  </span>
                </span>
              ),
            },
            { id: "enrolled", header: "Enrolled", align: "right", cell: (r) => r.enrolled },
            { id: "completion", header: "Completion", align: "right", cell: (r) => pct(reportRates(r).completionRate) },
            { id: "pass", header: "Pass rate", align: "right", cell: (r) => pct(reportRates(r).passRate) },
            { id: "certificates", header: "Certificates", align: "right", hideOnMobile: true, cell: (r) => r.certificates },
            {
              id: "placement",
              header: "Placement",
              align: "right",
              cell: (r) => (
                <span className="block">
                  {pct(reportRates(r).placementRate)}
                  <span className="block text-xs text-muted-foreground">
                    {r.placedLearners} placed · {r.verifiedPlacedLearners} verified
                  </span>
                </span>
              ),
            },
          ]}
          empty={
            <div className="p-5">
              <EmptyState icon={<BarChart3 aria-hidden="true" />} title="No data yet" description="Reports fill in as you run batches, record results and report placements." primaryAction={{ label: "View courses", href: "/institution/courses" }} />
            </div>
          }
        />
      </SectionCard>
    </div>
  );
}
