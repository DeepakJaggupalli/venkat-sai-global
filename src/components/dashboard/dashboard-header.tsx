import { CalendarDays } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { DASH_MOTION } from "./motion";
import { DASHBOARD_TIME_ZONE, formatDashboardDate, greetingFor, isoDateIn } from "./greeting";
import { PillLink } from "./pill-link";
import type { DashboardAction } from "./types";

export type DashboardHeaderProps = {
  /** Viewer's display name: the heading reads "Good morning, Ravi" (time of day in `timeZone`). */
  name?: string | null;
  /** Replaces the greeting as the page <h1> (rare: the greeting is the dashboard's heading). */
  title?: ReactNode;
  /** Role and organisation, e.g. "Operations Manager · Venkat Sai Global". */
  subtitle?: ReactNode;
  /** Small accent label above the heading (e.g. the portal name). */
  eyebrow?: ReactNode;
  /** Up to 3 pill buttons (extra ones are ignored). The first is black, the rest white, unless set. */
  actions?: readonly DashboardAction[];
  /** Extra row under the subtitle (status badges, a verification notice link…). */
  children?: ReactNode;
  /** Defaults to now; pass for deterministic tests. */
  now?: Date;
  /** Defaults to Asia/Kolkata (the business clock). */
  timeZone?: string;
  className?: string;
};

/**
 * Top of every portal dashboard: greeting by time of day, who you are, today's date and the main actions.
 * Owns the page's single <h1>. Server component (the greeting is computed at request time, so no flicker).
 *
 *   <DashboardHeader name={user.displayName} subtitle="Owner · Venkat Sai Global"
 *     actions={[{ label: "Post requirement", href: "/admin/requirements/posters/new", icon: Megaphone }]} />
 */
export function DashboardHeader({ name, title, subtitle, eyebrow, actions = [], children, now = new Date(), timeZone = DASHBOARD_TIME_ZONE, className }: DashboardHeaderProps) {
  const shown = actions.slice(0, 3);
  return (
    <header data-slot="dashboard-header" className={cn(DASH_MOTION.rise, "flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0 space-y-2">
        {eyebrow ? <p className="label-dot">{eyebrow}</p> : null}
        <h1 className="font-display text-[1.875rem] leading-[1.08] text-balance break-words text-foreground sm:text-[2.5rem]">{title ?? greetingFor(name, now, timeZone)}</h1>
        {subtitle ? <p className="max-w-2xl text-[15px] text-pretty text-muted-foreground sm:text-base">{subtitle}</p> : null}
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-accent-fill" />
          <time dateTime={isoDateIn(now, timeZone)}>{formatDashboardDate(now, timeZone)}</time>
        </p>
        {children ? <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div> : null}
      </div>
      {shown.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-start lg:shrink-0 lg:justify-end">
          {shown.map((action, index) => (
            <PillLink
              key={`${action.href}-${action.label}`}
              action={{ ...action, variant: action.variant ?? (index === 0 ? "primary" : "secondary") }}
              arrow={index === 0}
              // Odd counts: the first pill spans the row on phones, the rest pair up.
              className={cn("px-4 sm:px-5", shown.length % 2 === 1 && index === 0 && "col-span-2")}
            />
          ))}
        </div>
      ) : null}
    </header>
  );
}
