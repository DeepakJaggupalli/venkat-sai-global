import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { CATEGORY_LABELS, CHANNEL_LABELS, NOTIFICATION_CATEGORY_KEYS } from "@/modules/notifications/catalog";
import { getNotificationDeliveryStats, listNotificationTemplates } from "@/modules/notifications/queries";
import type { TemplateCatalogItem } from "@/modules/notifications/types";

import { NotificationAdminTabs } from "./_components/section-tabs";

export const metadata: Metadata = { title: "Notifications" };

const filtersSchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORY_KEYS).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

/** Template catalogue: every event with its default channels and the overrides saved per channel and language. */
export default async function NotificationTemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff(["notifications.templates", "notifications.logs"], "any");
  const canTemplates = staffCan(ctx, "notifications.templates");
  const canLogs = staffCan(ctx, "notifications.logs");
  if (!canTemplates) redirect("/admin/notifications/deliveries");
  const filters = filtersSchema.parse(await searchParams);
  const [items, stats] = await Promise.all([listNotificationTemplates(ctx, filters), canLogs ? getNotificationDeliveryStats(ctx, { days: 7 }) : Promise.resolve(null)]);
  const groups = new Map<string, TemplateCatalogItem[]>();
  for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Edit the wording of every message by event, channel and language, and check how deliveries are going." />
      <NotificationAdminTabs canTemplates={canTemplates} canLogs={canLogs} />
      {stats ? (
        <StatGrid columns={4}>
          <StatCard label="Sent (7 days)" value={stats.byStatus.sent + stats.byStatus.delivered} href="/admin/notifications/deliveries?status=sent" />
          <StatCard label="Failed (7 days)" value={stats.byStatus.failed} href="/admin/notifications/deliveries?status=failed" />
          <StatCard label="Skipped (7 days)" value={stats.byStatus.skipped} hint="Opted out, no address or channel off" href="/admin/notifications/deliveries?status=skipped" />
          <StatCard label="Waiting to send" value={stats.byStatus.queued} href="/admin/notifications/deliveries?status=queued" />
        </StatGrid>
      ) : null}
      <FilterScope>
        <FilterBar paramKeys={["q", "category"]} search={<SearchInput label="Search events" placeholder="Event name or key" />}>
          <FilterSelect param="category" label="Category" allLabel="All categories" options={NOTIFICATION_CATEGORY_KEYS.map((c) => ({ value: c, label: CATEGORY_LABELS[c].label }))} />
        </FilterBar>
        <FilterPendingRegion>
          {items.length === 0 ? (
            <EmptyState title="No events match" description="Try another search or category." />
          ) : (
            <div className="space-y-6">
              {[...groups.entries()].map(([category, events]) => (
                <SectionCard key={category} title={CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]?.label ?? category} headingLevel="h2" flush>
                  <ul className="divide-y divide-border">
                    {events.map((e) => {
                      const active = e.overrides.filter((o) => o.isActive);
                      return (
                        <li key={e.eventKey}>
                          <Link href={`/admin/notifications/templates/${encodeURIComponent(e.eventKey)}`} className="flex flex-col gap-2 px-5 py-3 hover:bg-surface-subtle focus-visible:bg-surface-subtle sm:flex-row sm:items-center sm:justify-between">
                            <span className="min-w-0">
                              <span className="block font-medium text-foreground">{e.label}</span>
                              <span className="block text-xs text-muted-foreground">
                                {e.eventKey} · {e.defaultChannels.map((c) => CHANNEL_LABELS[c]).join(", ")}
                              </span>
                            </span>
                            <span className="flex flex-wrap gap-2">
                              {e.mandatory ? <StatusBadge tone="neutral" size="sm">Always sent</StatusBadge> : null}
                              {active.length ? (
                                <StatusBadge tone="brand" size="sm">
                                  {active.length} custom {active.length === 1 ? "template" : "templates"}
                                </StatusBadge>
                              ) : (
                                <StatusBadge tone="neutral" size="sm">Default wording</StatusBadge>
                              )}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </SectionCard>
              ))}
            </div>
          )}
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
