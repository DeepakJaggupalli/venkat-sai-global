"use client";

import { BadgeCheck, CalendarClock, CircleX, Hourglass, SearchCheck, ShieldAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import type { OrgStatus } from "@/db/schema/_constants";
import { cn } from "@/lib/utils";

import { getOrgStatusNotice, type OrgStatusNotice, type OrgStatusTone } from "./org-status";
import type { OrgPortalKey } from "./portal-config";
import { SHELL_CONTENT_CLASS } from "./shell-styles";

const ICONS: Record<OrgStatusNotice["status"], LucideIcon> = {
  draft: BadgeCheck,
  pending: Hourglass,
  under_review: SearchCheck,
  rejected: CircleX,
  suspended: ShieldAlert,
  expired: CalendarClock,
};

const TONE: Record<OrgStatusTone, { surface: string; icon: string }> = {
  info: { surface: "border-info/15 bg-info-soft", icon: "bg-white text-info" },
  warning: { surface: "border-warning/20 bg-warning-soft", icon: "bg-white text-warning" },
  danger: { surface: "border-destructive/15 bg-danger-soft", icon: "bg-white text-destructive" },
};

function samePath(a: string, b: string): boolean {
  const strip = (value: string) => (value.length > 1 ? value.replace(/\/+$/, "") : value);
  return strip(a) === strip(b);
}

/**
 * Organisation verification banner for the employer / partner / institution portals.
 * Renders nothing for verified organisations. Rendered by the (workspace) layouts below the top bar.
 */
export function OrgStatusBanner({ portal, status }: { portal: OrgPortalKey; status: OrgStatus }) {
  const pathname = usePathname();
  const titleId = useId();
  const notice = getOrgStatusNotice(status, portal);
  if (!notice) return null;

  const Icon = ICONS[notice.status];
  const tone = TONE[notice.tone];
  // No point offering a link to the page the member is already on.
  const actions = [notice.primary, notice.secondary].filter(
    (action): action is NonNullable<typeof action> => !!action && !samePath(action.href, pathname),
  );

  return (
    <section aria-labelledby={titleId} className={cn("border-b", tone.surface)}>
      <div className={cn(SHELL_CONTENT_CLASS, "flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:gap-6")}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg shadow-xs", tone.icon)} aria-hidden>
            <Icon className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="font-heading text-sm font-semibold text-navy sm:text-[15px]">
              {notice.title}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{notice.description}</p>
          </div>
        </div>
        {actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-2 pl-12 sm:pl-0">
            {actions.map((action, index) => (
              <Button key={action.href} asChild size="lg" variant={index === 0 ? "default" : "outline"} className="px-3.5">
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
