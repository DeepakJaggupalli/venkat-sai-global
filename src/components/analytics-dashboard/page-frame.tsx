import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shared/page-header";
import type { ActionSlot } from "@/components/shared/types";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { localDate } from "@/modules/analytics/range";
import type { AnalyticsRange } from "@/modules/analytics/range";

import { AnalyticsNav, type AnalyticsNavItem } from "./analytics-nav";
import { describeRange } from "./format";
import { RangePicker } from "./range-picker";

const NAV: readonly (AnalyticsNavItem & { permission?: string })[] = [
  { href: "/admin/analytics", label: "Overview" },
  { href: "/admin/analytics/realtime", label: "Real-time" },
  { href: "/admin/analytics/sources", label: "Sources and campaigns" },
  { href: "/admin/analytics/pages", label: "Pages" },
  { href: "/admin/analytics/audience", label: "Audience" },
  { href: "/admin/analytics/funnels", label: "Journeys and funnels" },
  { href: "/admin/analytics/events", label: "Events" },
  { href: "/admin/analytics/engagement", label: "Forms, search and CTAs" },
  { href: "/admin/analytics/heatmaps", label: "Heatmaps" },
  { href: "/admin/analytics/sessions", label: "Session diagnostics", permission: "analytics.sessions" },
  { href: "/admin/analytics/exports", label: "Exports", permission: "analytics.export" },
  { href: "/admin/analytics/settings", label: "Settings" },
];

type AnalyticsFrameProps = {
  staff: StaffContext;
  title: string;
  description: ReactNode;
  /** Omit on pages that do not depend on a reporting period (real-time, settings). */
  range?: AnalyticsRange;
  actions?: ActionSlot | ActionSlot[];
  /** Extra breadcrumb under "Analytics" (deeper pages). */
  trail?: { label: string; href?: string }[];
  /** The analytics home page (breadcrumb ends at "Analytics"). */
  root?: boolean;
  children: ReactNode;
};

/** Shared header (title, breadcrumbs, section navigation, reporting period) for every analytics page. */
export function AnalyticsFrame({ staff, title, description, range, actions, trail, root, children }: AnalyticsFrameProps) {
  const items = NAV.filter((i) => !i.permission || staffCan(staff, i.permission as Parameters<typeof staffCan>[1])).map(({ href, label }) => ({ href, label }));
  const breadcrumbs = [
    { label: "Command Centre", href: "/admin" },
    ...(root ? [{ label: "Analytics" }] : [{ label: "Analytics", href: "/admin/analytics" }, ...(trail ?? []), { label: title }]),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} breadcrumbs={breadcrumbs} actions={actions} />
      <AnalyticsNav items={items} />
      {range ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
          <RangePicker preset={range.preset} from={range.from} to={range.to} maxDate={localDate(new Date(), range.timeZone)} />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="font-medium text-foreground">{describeRange(range.from, range.to)}</span>
            {" · compared with "}
            {describeRange(range.previousFrom, range.previousTo)}
            <span className="block text-xs">Days in {range.timeZone}</span>
          </p>
        </div>
      ) : null}
      {children}
      <PrivacyFootnote />
    </div>
  );
}

/** Standing notice on every analytics page: what the data is and is not. */
export function PrivacyFootnote() {
  return (
    <aside aria-label="About this data" className="flex gap-3 rounded-xl border border-dashed bg-surface-subtle p-4 text-sm text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-strong" aria-hidden="true" />
      <p>
        Pseudonymous, consent-based data. Visitors are counted only after they accept analytics cookies; random ids replace
        identities, no IP addresses, form contents or keystrokes are stored, and staff and under-18 users are never tracked.
        Figures therefore undercount real traffic.
      </p>
    </aside>
  );
}
