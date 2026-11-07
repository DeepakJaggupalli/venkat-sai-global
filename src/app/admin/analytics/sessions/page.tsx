import type { Metadata } from "next";

import { formatDuration } from "@/components/analytics-dashboard/format";
import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import { OpenSessionButton } from "@/components/analytics-dashboard/session-diagnostics";
import { Callout } from "@/components/shared/callout";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { env } from "@/lib/env";
import { parsePage, type SearchParams } from "@/lib/http";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { isRandomId } from "@/modules/analytics/consent";
import { listSessions, type SessionListFilter } from "@/modules/analytics/sessions";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Session diagnostics" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const DEVICE_OPTIONS = [
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile" },
  { value: "tablet", label: "Tablet" },
  { value: "other", label: "Other" },
];
const SIGNED_IN_OPTIONS = [{ value: "yes", label: "Signed-in sessions only" }];
const MIN_PAGES_OPTIONS = ["2", "3", "5", "10"].map((v) => ({ value: v, label: `${v}+ pages` }));

function parseFilter(sp: SearchParams): SessionListFilter {
  const device = first(sp.device);
  const landing = first(sp.landing)?.trim();
  const minPages = Number(first(sp.minPages));
  return {
    deviceType: DEVICE_OPTIONS.some((d) => d.value === device) ? (device as SessionListFilter["deviceType"]) : undefined,
    signedInOnly: first(sp.signedIn) === "yes" || undefined,
    minPageViews: MIN_PAGES_OPTIONS.some((o) => Number(o.value) === minPages) ? minPages : undefined,
    landingPath: landing && landing.startsWith("/") && landing.length <= 300 ? landing : undefined,
  };
}

export default async function SessionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.sessions");
  const sp = await searchParams;
  const range = getAnalyticsRange(sp);
  const page = parsePage(sp, { defaultSize: 25, maxSize: 100 });
  const sessions = await listSessions(staff, range, parseFilter(sp), page);
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;
  const requested = first(sp.session);
  const linkedSession = requested && isRandomId(requested) ? requested : null;

  return (
    <AnalyticsFrame
      staff={staff}
      range={range}
      title="Session diagnostics"
      description="Find a single visit to diagnose a reported problem. Opening a session needs a reason and is recorded in the access log."
    >
      <Callout tone="warning" title="Restricted and logged">
        Sessions are pseudonymous. Open one only to investigate a specific problem; every opening is recorded with your name and reason, and
        signed-in sessions are linked to the person&apos;s record in the data-access log they can request.
      </Callout>

      {linkedSession ? (
        <SectionCard title="Session from the event log">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">You followed a link to one session. Give a reason to open it.</p>
            <OpenSessionButton sessionId={linkedSession} timeZone={timeZone} defaultOpen label="Open linked session" />
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Sessions" description="Newest first. No user identities are shown in this list.">
        <FilterScope>
          <div className="space-y-4">
            <FilterBar
              paramKeys={["landing", "device", "signedIn", "minPages"]}
              search={<SearchInput param="landing" label="Landing page" placeholder="/jobs" maxLength={300} />}
            >
              <FilterSelect param="device" label="Device" allLabel="All devices" options={DEVICE_OPTIONS} />
              <FilterSelect param="signedIn" label="Signed in" allLabel="All sessions" options={SIGNED_IN_OPTIONS} />
              <FilterSelect param="minPages" label="Pages viewed" allLabel="Any number of pages" options={MIN_PAGES_OPTIONS} />
            </FilterBar>
            <FilterChips
              filters={[
                { param: "landing", label: "Landing" },
                { param: "device", label: "Device", options: DEVICE_OPTIONS },
                { param: "signedIn", label: "Signed in", options: SIGNED_IN_OPTIONS },
                { param: "minPages", label: "Pages", options: MIN_PAGES_OPTIONS },
              ]}
            />
            <FilterPendingRegion>
              <DataTable
                caption="Sessions"
                rows={sessions.items}
                getRowId={(s) => s.id}
                columns={[
                  { id: "started", header: "Started", nowrap: true, cell: (s) => <DateText value={s.startedAt} mode="datetime" timeZone={timeZone} /> },
                  {
                    id: "landing",
                    header: "Landing page",
                    primary: true,
                    cell: (s) => (
                      <div className="min-w-0">
                        {s.landingPath ? <code className="font-mono text-xs break-all">{s.landingPath}</code> : "—"}
                        <p className="text-xs text-muted-foreground">from {s.source}</p>
                      </div>
                    ),
                  },
                  {
                    id: "device",
                    header: "Device",
                    hideOnMobile: true,
                    cell: (s) => [s.deviceType, s.browser, s.os].filter(Boolean).join(" · ") || "—",
                  },
                  { id: "country", header: "Country", hideOnMobile: true, cell: (s) => s.countryCode ?? "—" },
                  { id: "pages", header: "Pages", align: "right", cell: (s) => s.pageViews.toLocaleString("en-IN") },
                  { id: "duration", header: "Duration", align: "right", cell: (s) => formatDuration(s.durationSeconds) },
                  {
                    id: "flags",
                    header: "Notes",
                    hideOnMobile: true,
                    cell: (s) => (
                      <div className="flex flex-wrap gap-1">
                        {s.isBounce ? (
                          <StatusBadge size="sm" tone="neutral">
                            Bounce
                          </StatusBadge>
                        ) : null}
                        {s.isSignedIn ? (
                          <StatusBadge size="sm" tone="info">
                            Signed in
                          </StatusBadge>
                        ) : null}
                      </div>
                    ),
                  },
                  { id: "open", header: <span className="sr-only">Actions</span>, align: "right", cell: (s) => <OpenSessionButton sessionId={s.id} timeZone={timeZone} /> },
                ]}
                empty={<EmptyState size="sm" variant="plain" title="No sessions match" description="Clear the filters or choose a longer period." />}
                footer={
                  <Pagination
                    pathname="/admin/analytics/sessions"
                    searchParams={sp}
                    page={sessions.page}
                    pageCount={sessions.pageCount}
                    total={sessions.total}
                    pageSize={sessions.pageSize}
                    itemLabel="sessions"
                  />
                }
              />
            </FilterPendingRegion>
          </div>
        </FilterScope>
      </SectionCard>
    </AnalyticsFrame>
  );
}
