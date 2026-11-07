import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";

import { INTERVIEW_RESPONSE, INTERVIEW_STATUS, labelOf } from "@/components/recruiter/labels";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage } from "@/lib/http";
import { requireOrgMember } from "@/modules/identity/authz";
import { INTERVIEW_MODE_LABELS } from "@/modules/recruitment/constants";
import { listInterviewsForPartner } from "@/modules/recruitment/queries";

import { sp } from "../_lib/page-utils";

export const metadata: Metadata = { title: "Interviews" };

export default async function RecruiterInterviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgMember("recruitment_partner", "partner.submissions.view");
  const params = await searchParams;
  const past = sp(params, "when") === "past";
  const page = parsePage(params, { defaultSize: 25 });
  const now = new Date();
  // Upcoming includes interviews that started in the last 12 hours (still happening today).
  const boundary = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const result = await listInterviewsForPartner(ctx, past ? { to: boundary } : { from: boundary }, page);
  const items = result.items;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interviews"
        description="Interviews and trade tests for candidates your agency submitted. Help your candidates prepare and attend; Venkat Sai or the employer manages the schedule."
      />
      <LinkTabs
        label="Interview period"
        items={[
          { href: "/recruiter/interviews", label: "Upcoming", match: "exact" },
          { href: "/recruiter/interviews?when=past", label: "Past" },
        ]}
        activeHref={past ? "/recruiter/interviews?when=past" : "/recruiter/interviews"}
      />
      <DataTable
        caption={past ? "Past interviews" : "Upcoming interviews"}
        rows={items}
        getRowId={(i) => i.id}
        columns={[
          {
            id: "candidate",
            header: "Candidate",
            primary: true,
            cell: (i) => (
              <div className="min-w-0">
                <p className="font-medium text-foreground">{i.candidateName}</p>
                <p className="text-xs text-muted-foreground">{i.jobTitle}</p>
              </div>
            ),
          },
          {
            id: "when",
            header: "When",
            cell: (i) => (
              <div>
                <DateText value={i.scheduledStart} mode="datetime" timeZone={i.timezone} />
                <p className="text-xs text-muted-foreground">{i.timezone}</p>
              </div>
            ),
          },
          {
            id: "round",
            header: "Round",
            cell: (i) => (
              <div>
                <p>{i.roundName || `Round ${i.roundNumber}`}</p>
                <p className="text-xs text-muted-foreground">
                  {INTERVIEW_MODE_LABELS[i.mode]}
                  {i.mode === "in_person" || i.mode === "trade_test" ? (i.location ? ` · ${i.location}` : "") : ""}
                </p>
              </div>
            ),
          },
          { id: "by", header: "Conducted by", hideOnMobile: true, cell: (i) => (i.conductedBy === "venkat_sai" ? "Venkat Sai" : "Employer") },
          {
            id: "status",
            header: "Status",
            cell: (i) => {
              const s = labelOf(INTERVIEW_STATUS, i.status);
              return (
                <div className="space-y-0.5">
                  <StatusBadge tone={s.tone} size="sm">
                    {s.label}
                  </StatusBadge>
                  <p className="text-xs text-muted-foreground">{INTERVIEW_RESPONSE[i.candidateResponse] ?? ""}</p>
                </div>
              );
            },
          },
        ]}
        empty={
          <EmptyState
            icon={<CalendarClock aria-hidden="true" />}
            title={past ? "No past interviews" : "No upcoming interviews"}
            description="When Venkat Sai or an employer schedules an interview for one of your candidates, it appears here and you are notified."
            primaryAction={{ label: "View submissions", href: "/recruiter/submissions" }}
          />
        }
        footer={
          result.pageCount > 1 ? (
            <Pagination pathname="/recruiter/interviews" searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="interviews" />
          ) : null
        }
      />
    </div>
  );
}
