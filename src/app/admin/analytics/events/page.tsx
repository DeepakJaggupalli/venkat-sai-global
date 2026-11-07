import Link from "next/link";
import type { Metadata } from "next";

import { analyticsHref, propEntries } from "@/components/analytics-dashboard/format";
import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
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
import { getEventCounts, listEvents } from "@/modules/analytics/behaviour";
import { ANALYTICS_EVENT_LABELS, ANALYTICS_EVENTS } from "@/modules/analytics/events";
import { eventsFilterSchema } from "@/modules/analytics/schemas";
import { requireStaff, staffCan } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Events explorer" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function EventsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.view");
  const sp = await searchParams;
  const range = getAnalyticsRange(sp);
  const filter = eventsFilterSchema.parse({ name: first(sp.name), path: first(sp.path)?.trim() || undefined, source: first(sp.source) });
  const page = parsePage(sp, { defaultSize: 50, maxSize: 100 });
  const canSessions = staffCan(staff, "analytics.sessions");
  const timeZone = staff.user.timezone ?? env().DEFAULT_TIMEZONE;

  const [counts, events] = await Promise.all([getEventCounts(staff, range), listEvents(staff, range, filter, page)]);
  const eventOptions = ANALYTICS_EVENTS.map((e) => ({ value: e, label: ANALYTICS_EVENT_LABELS[e] }));
  const sourceOptions = [
    { value: "client", label: "Browser" },
    { value: "server", label: "Server" },
  ];

  return (
    <AnalyticsFrame
      staff={staff}
      range={range}
      title="Events"
      description="Every recorded event by name, and a searchable log of individual events with their non-personal properties."
    >
      <SectionCard title="Event totals" description="Key events (conversions) are marked." flush>
        <DataTable
          caption="Event totals"
          rows={counts}
          getRowId={(r) => r.name}
          rowLink={(r) => ({ href: analyticsHref("/admin/analytics/events", range, { name: r.name }), label: `Show ${r.label} events` })}
          columns={[
            {
              id: "name",
              header: "Event",
              primary: true,
              cell: (r) => (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.label}</span>
                  <code className="font-mono text-xs text-muted-foreground">{r.name}</code>
                  {r.isConversion ? (
                    <StatusBadge size="sm" tone="success">
                      Conversion
                    </StatusBadge>
                  ) : null}
                </div>
              ),
            },
            { id: "count", header: "Events", align: "right", cell: (r) => r.count.toLocaleString("en-IN") },
            { id: "sessions", header: "Sessions", align: "right", cell: (r) => r.sessions.toLocaleString("en-IN") },
          ]}
          empty={<EmptyState size="sm" variant="plain" title="No events in this period" />}
        />
      </SectionCard>

      <SectionCard title="Event log" description='Newest first. Filter by path with an exact path, or a prefix ending in * (for example "/jobs*").'>
        <FilterScope>
          <div className="space-y-4">
            <FilterBar paramKeys={["name", "source", "path"]} search={<SearchInput param="path" label="Filter by path" placeholder="/jobs*" maxLength={300} />}>
              <FilterSelect param="name" label="Event" allLabel="All events" options={eventOptions} />
              <FilterSelect param="source" label="Recorded by" allLabel="Browser and server" options={sourceOptions} />
            </FilterBar>
            <FilterChips
              filters={[
                { param: "name", label: "Event", options: eventOptions },
                { param: "source", label: "Recorded by", options: sourceOptions },
                { param: "path", label: "Path" },
              ]}
            />
            <FilterPendingRegion>
              <DataTable
                caption="Event log"
                rows={events.items}
                getRowId={(e) => String(e.id)}
                columns={[
                  { id: "when", header: "When", nowrap: true, cell: (e) => <DateText value={e.occurredAt} mode="datetime" timeZone={timeZone} /> },
                  {
                    id: "event",
                    header: "Event",
                    primary: true,
                    cell: (e) => (
                      <div>
                        <code className="font-mono text-xs">{e.name}</code>
                        <p className="text-xs text-muted-foreground">{e.source === "server" ? "Server" : "Browser"}</p>
                      </div>
                    ),
                  },
                  { id: "path", header: "Path", cell: (e) => (e.path ? <code className="font-mono text-xs break-all">{e.path}</code> : "—") },
                  {
                    id: "props",
                    header: "Properties",
                    hideOnMobile: true,
                    cell: (e) => {
                      const entries = propEntries(e.props);
                      return entries.length ? (
                        <ul className="flex flex-wrap gap-1">
                          {entries.map((p) => (
                            <li key={p} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs break-all">
                              {p}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      );
                    },
                  },
                  ...(canSessions
                    ? [
                        {
                          id: "session",
                          header: <span className="sr-only">Session</span>,
                          align: "right" as const,
                          cell: (e: (typeof events.items)[number]) =>
                            e.sessionId ? (
                              <Link
                                className="text-sm font-medium text-teal-strong underline-offset-4 hover:underline"
                                href={analyticsHref("/admin/analytics/sessions", range, { session: e.sessionId })}
                              >
                                Session<span className="sr-only"> diagnostics for this event</span>
                              </Link>
                            ) : null,
                        },
                      ]
                    : []),
                ]}
                empty={<EmptyState size="sm" variant="plain" title="No events match these filters" description="Clear the filters or choose a longer period." />}
                footer={
                  <Pagination
                    pathname="/admin/analytics/events"
                    searchParams={sp}
                    page={events.page}
                    pageCount={events.pageCount}
                    total={events.total}
                    pageSize={events.pageSize}
                    itemLabel="events"
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
