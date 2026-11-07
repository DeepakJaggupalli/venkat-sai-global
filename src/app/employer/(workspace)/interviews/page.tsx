import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";

import { InterviewCard } from "@/components/employer-talent/interview-card";
import { timeZoneOptions } from "@/components/employer-talent/time-zones";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { parsePage, type SearchParams } from "@/lib/http";
import { orgCan, requireOrgMember } from "@/modules/identity/authz";
import { listInterviewsForEmployer } from "@/modules/recruitment/queries";
import { formatInTimeZone, utcToZonedLocal, zonedLocalToUtc } from "@/modules/recruitment/timezone";

import { viewerTimeZone } from "../pipeline/_lib/shared";

export const metadata: Metadata = { title: "Interviews" };

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
];
const WHEN_OPTIONS = [
  { value: "past", label: "Past interviews" },
  { value: "all", label: "All dates" },
];
type Status = "scheduled" | "rescheduled" | "completed" | "cancelled" | "no_show";

/** Monday (YYYY-MM-DD) of the week containing `isoDate`. */
function weekStart(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("employer", ["employer.interviews.manage", "employer.pipeline.view"], "any");
  const sp = await searchParams;
  const tz = viewerTimeZone(ctx);
  const canManage = orgCan(ctx, "employer.interviews.manage");
  const view = sp.view === "week" ? "week" : "list";
  const status = STATUS_OPTIONS.some((o) => o.value === sp.status) ? (sp.status as Status) : undefined;
  const now = new Date();
  const today = utcToZonedLocal(now, tz).slice(0, 10);
  const timeZones = timeZoneOptions([tz]);

  let from: Date | undefined;
  let to: Date | undefined;
  let week = "";
  if (view === "week") {
    week = weekStart(typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today);
    from = zonedLocalToUtc(`${week}T00:00`, tz);
    to = zonedLocalToUtc(`${addDays(week, 7)}T00:00`, tz);
  } else if (sp.when === "past") {
    to = now;
  } else if (sp.when !== "all") {
    from = new Date(now.getTime() - 60 * 60 * 1000);
  }

  const page = view === "week" ? { page: 1, pageSize: 200, offset: 0 } : parsePage(sp, { defaultSize: 20, maxSize: 50 });
  const result = await listInterviewsForEmployer(ctx, { from, to, status }, page);

  const days =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => {
          const date = addDays(week, i);
          return { date, items: result.items.filter((iv) => utcToZonedLocal(new Date(iv.scheduledStart), tz).slice(0, 10) === date) };
        })
      : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interviews"
        description={`Times are shown in each interview's own time zone, with yours (${tz}) where different.`}
        actions={orgCan(ctx, "employer.pipeline.view") ? [{ label: "Schedule from the pipeline", href: "/employer/pipeline", variant: "outline" }] : undefined}
      />
      <LinkTabs
        label="Interview views"
        items={[
          { href: "/employer/interviews", label: "List", match: "exact" },
          { href: "/employer/interviews?view=week", label: "Week" },
        ]}
        activeHref={view === "week" ? "/employer/interviews?view=week" : "/employer/interviews"}
      />

      {view === "list" ? (
        <FilterBar paramKeys={["status", "when"]}>
          <FilterSelect param="when" label="When" options={WHEN_OPTIONS} allLabel="Upcoming" />
          <FilterSelect param="status" label="Status" options={STATUS_OPTIONS} allLabel="All statuses" />
        </FilterBar>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold">
            Week of {formatInTimeZone(zonedLocalToUtc(`${week}T12:00`, tz), tz).split(",")[0]}
          </h2>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/employer/interviews?view=week&week=${addDays(week, -7)}`}>
                <ChevronLeft aria-hidden className="size-4" />
                Previous week
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/employer/interviews?view=week">This week</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/employer/interviews?view=week&week=${addDays(week, 7)}`}>
                Next week
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {view === "week" ? (
        <ol className="grid gap-4 lg:grid-cols-7" aria-label="Days of the week">
          {days.map((d) => (
            <li key={d.date} className="min-w-0 rounded-xl border bg-surface-subtle p-3" aria-label={d.date}>
              <h3 className={`mb-2 font-heading text-sm font-semibold ${d.date === today ? "text-teal-strong" : ""}`}>
                {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                {d.date === today ? <span className="ml-1 text-xs font-normal">(today)</span> : null}
              </h3>
              {d.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No interviews</p>
              ) : (
                <ul className="space-y-2">
                  {d.items.map((iv) => (
                    <li key={iv.id} className="rounded-lg border bg-card p-2 text-xs">
                      <p className="font-medium">{utcToZonedLocal(new Date(iv.scheduledStart), tz).slice(11, 16)}</p>
                      <Link href={`/employer/pipeline/${iv.jobId}?application=${iv.applicationId}`} className="text-teal-strong underline-offset-4 hover:underline">
                        {iv.candidateName}
                      </Link>
                      <p className="text-muted-foreground">
                        {iv.roundName} · {iv.status === "cancelled" ? "Cancelled" : iv.jobTitle}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      ) : result.items.length === 0 ? (
        <EmptyState
          icon={<CalendarClock aria-hidden />}
          title={sp.when === "past" ? "No past interviews" : status ? "No interviews with this status" : "No upcoming interviews"}
          description="Schedule interviews from a candidate's application in the pipeline. Candidates and panel members are notified automatically."
          primaryAction={orgCan(ctx, "employer.pipeline.view") ? { label: "Open the pipeline", href: "/employer/pipeline" } : undefined}
        />
      ) : (
        <>
          <ul className="grid gap-4 xl:grid-cols-2" aria-label="Interviews">
            {result.items.map((iv) => (
              <li key={iv.id}>
                <InterviewCard interview={iv} viewerTimeZone={tz} timeZones={timeZones} meUserId={ctx.user.id} canManage={canManage} showCandidate />
              </li>
            ))}
          </ul>
          <Pagination pathname="/employer/interviews" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="interviews" />
        </>
      )}
    </div>
  );
}
