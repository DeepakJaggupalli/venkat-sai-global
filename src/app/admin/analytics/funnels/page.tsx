import Link from "next/link";
import type { Metadata } from "next";

import { analyticsHref } from "@/components/analytics-dashboard/format";
import { FunnelAdminActions } from "@/components/analytics-dashboard/funnel-admin-actions";
import { FunnelChart } from "@/components/analytics-dashboard/funnel-chart";
import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import type { SearchParams } from "@/lib/http";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { computeFunnel, listFunnels } from "@/modules/analytics/funnels";
import { requireStaff, staffCan } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Journeys and funnels" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FunnelsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.view");
  const sp = await searchParams;
  const range = getAnalyticsRange(sp);
  const canConfigure = staffCan(staff, "analytics.configure");
  const groupBy = first(sp.by) === "session" ? "session" : "visitor";

  const funnels = await listFunnels(staff);
  const requested = first(sp.funnel);
  const selected =
    (requested && UUID_RE.test(requested) ? funnels.find((f) => f.id === requested) : undefined) ?? funnels.find((f) => f.isActive) ?? funnels[0] ?? null;
  const result = selected ? await computeFunnel(staff, selected.id, range, { groupBy }) : null;
  const selectedHref = (extra: Record<string, string>) => analyticsHref("/admin/analytics/funnels", range, { funnel: selected?.id, ...extra });

  return (
    <AnalyticsFrame
      staff={staff}
      range={range}
      title="Journeys and funnels"
      description="How many people move through each step of a journey, in order, and where they drop off."
      actions={{ label: "Build a funnel", href: analyticsHref("/admin/analytics/funnels/new", range) }}
    >
      {funnels.length === 0 ? (
        <EmptyState
          title="No funnels yet"
          description="The standard employer and candidate journeys are added when the database is seeded. You can also build your own."
          primaryAction={{ label: "Build a funnel", href: "/admin/analytics/funnels/new" }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="Funnels" className="space-y-2">
            <ul className="space-y-2">
              {funnels.map((f) => {
                const active = f.id === selected?.id;
                return (
                  <li key={f.id}>
                    <Link
                      href={analyticsHref("/admin/analytics/funnels", range, { funnel: f.id, by: groupBy === "session" ? "session" : undefined })}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-xl border bg-card p-3 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        active ? "border-teal ring-1 ring-teal" : "hover:bg-secondary",
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{f.name}</span>
                        {f.isActive ? null : (
                          <StatusBadge size="sm" tone="neutral">
                            Inactive
                          </StatusBadge>
                        )}
                        {f.key ? (
                          <StatusBadge size="sm" tone="info">
                            Default
                          </StatusBadge>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {f.steps.length} steps · within {f.windowDays} {f.windowDays === 1 ? "day" : "days"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {selected && result ? (
            <SectionCard
              title={selected.name}
              description={selected.description ?? undefined}
              action={canConfigure ? { label: "Edit", href: analyticsHref(`/admin/analytics/funnels/${selected.id}/edit`, range), variant: "outline" } : undefined}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <LinkTabs
                    label="Count funnel by"
                    items={[
                      { href: selectedHref({}), label: "Visitors" },
                      { href: selectedHref({ by: "session" }), label: "Sessions" },
                    ]}
                    activeHref={groupBy === "session" ? selectedHref({ by: "session" }) : selectedHref({})}
                  />
                  {canConfigure ? <FunnelAdminActions id={selected.id} name={selected.name} isActive={selected.isActive} isDefault={selected.key !== null} /> : null}
                </div>
                <FunnelChart result={result} />
              </div>
            </SectionCard>
          ) : null}
        </div>
      )}
    </AnalyticsFrame>
  );
}
