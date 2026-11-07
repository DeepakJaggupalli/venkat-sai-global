import type { Metadata } from "next";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeFilter, FilterBar, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { NOTIFICATION_DELIVERY_STATUSES } from "@/db/schema/notifications";
import { env } from "@/lib/env";
import { humanize } from "@/lib/format";
import { parsePage, type SearchParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { CHANNEL_LABELS, NOTIFICATION_CHANNEL_KEYS } from "@/modules/notifications/catalog";
import { NOTIFICATION_EVENTS } from "@/modules/notifications/events";
import { listNotificationDeliveries } from "@/modules/notifications/queries";
import { deliveryFiltersSchema } from "@/modules/notifications/schemas";

import { retryAvailability } from "../_lib/deliveries";
import { RetryDeliveryButton } from "../_components/retry-button";
import { NotificationAdminTabs } from "../_components/section-tabs";

export const metadata: Metadata = { title: "Notification delivery log" };

const BASE = "/admin/notifications/deliveries";
const STATUS_TONE = { queued: "info", sent: "success", delivered: "success", failed: "danger", skipped: "neutral" } as const;

/** Every delivery attempt with masked recipients; failed ones can be retried while attempts remain. */
export default async function DeliveryLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("notifications.logs");
  const sp = await searchParams;
  const filters = deliveryFiltersSchema.parse(sp);
  const page = parsePage(sp, { defaultSize: 50, maxSize: 100 });
  const result = await listNotificationDeliveries(ctx, filters, page);
  const retryable = await retryAvailability(result.items.filter((d) => d.status === "failed").map((d) => d.id));
  const timeZone = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const eventOptions = Object.entries(NOTIFICATION_EVENTS).map(([value, meta]) => ({ value, label: (meta as { label: string }).label }));

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Notifications", href: "/admin/notifications" }, { label: "Delivery log" }]} />
      <PageHeader title="Delivery log" description="Emails, SMS, WhatsApp and in-app messages sent by the platform. Recipients are masked; search an exact address or number to find it." />
      <NotificationAdminTabs canTemplates={staffCan(ctx, "notifications.templates")} canLogs />
      <FilterScope>
        <FilterBar paramKeys={["recipient", "status", "channel", "eventKey", "from", "to"]} search={<SearchInput param="recipient" label="Exact email or phone" placeholder="Exact email or phone number" minLength={5} />}>
          <FilterSelect param="status" label="Status" allLabel="All statuses" options={NOTIFICATION_DELIVERY_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
          <FilterSelect param="channel" label="Channel" allLabel="All channels" options={NOTIFICATION_CHANNEL_KEYS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))} />
          <FilterSelect param="eventKey" label="Event" allLabel="All events" options={eventOptions} />
          <DateRangeFilter label="Created" />
        </FilterBar>
        <FilterPendingRegion>
          <DataTable
            caption="Notification deliveries"
            rows={result.items}
            getRowId={(d) => d.id}
            columns={[
              {
                id: "event",
                header: "Message",
                primary: true,
                cell: (d) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{(NOTIFICATION_EVENTS as Record<string, { label: string }>)[d.eventKey]?.label ?? d.eventKey}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {CHANNEL_LABELS[d.channel]} · {d.userName ?? d.recipient ?? "Unknown recipient"}
                      {d.userName && d.recipient ? ` (${d.recipient})` : ""}
                    </p>
                  </div>
                ),
              },
              {
                id: "status",
                header: "Status",
                cell: (d) => (
                  <span className="flex flex-col gap-1">
                    <StatusBadge tone={STATUS_TONE[d.status]} size="sm">
                      {humanize(d.status)}
                    </StatusBadge>
                    {d.skipReason ? <span className="text-xs text-muted-foreground">{humanize(d.skipReason)}</span> : null}
                    {d.lastError ? <span className="max-w-xs truncate text-xs text-danger-strong" title={d.lastError}>{d.lastError}</span> : null}
                  </span>
                ),
              },
              { id: "attempts", header: "Attempts", align: "right", hideOnMobile: true, cell: (d) => d.attempts },
              { id: "provider", header: "Provider", hideOnMobile: true, cell: (d) => d.provider ?? "—" },
              { id: "created", header: "Created", nowrap: true, cell: (d) => <DateText value={d.createdAt} mode="datetime" timeZone={timeZone} /> },
              {
                id: "actions",
                header: "Actions",
                cell: (d) => (d.status === "failed" && retryable.get(d.id) ? <RetryDeliveryButton id={d.id} /> : null),
              },
            ]}
            empty={<EmptyState title="No deliveries match" description="Messages appear here as soon as the platform sends them." />}
            footer={<Pagination pathname={BASE} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="deliveries" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}
