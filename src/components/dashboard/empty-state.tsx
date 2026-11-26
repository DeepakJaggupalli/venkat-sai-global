import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { PillLink } from "./pill-link";
import type { DashboardAction } from "./types";

export type EmptyStateProps = {
  /** What will appear here: "No CVs yet". */
  title: ReactNode;
  /** Why it is empty and what happens next, in one or two short lines. */
  description?: ReactNode;
  icon?: LucideIcon;
  /** The next step (black pill). */
  action?: DashboardAction;
  /** A second, quieter step (white pill). */
  secondaryAction?: DashboardAction;
  size?: "sm" | "md";
  className?: string;
};

/**
 * Honest empty state for dashboard cards: says what will appear and offers the next step.
 * Never fill an empty list with sample data. Server component.
 */
export function EmptyState({ title, description, icon: Icon = Inbox, action, secondaryAction, size = "md", className }: EmptyStateProps) {
  return (
    <div
      data-slot="dashboard-empty"
      className={cn(
        "flex flex-col items-center rounded-[18px] border border-dashed border-border bg-surface-subtle/70 text-center",
        size === "sm" ? "gap-2 px-4 py-6" : "gap-3 px-5 py-8 sm:py-10",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("flex items-center justify-center rounded-2xl bg-white text-accent-text shadow-xs", size === "sm" ? "size-10 [&_svg]:size-5" : "size-12 [&_svg]:size-6")}>
        <Icon />
      </span>
      <p className={cn("font-heading font-bold text-balance text-foreground", size === "sm" ? "text-[15px]" : "text-base")}>{title}</p>
      {description ? <p className="max-w-sm text-sm text-pretty text-muted-foreground">{description}</p> : null}
      {action || secondaryAction ? (
        <div className="mt-1 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">
          {action ? <PillLink action={{ ...action, variant: action.variant ?? "primary" }} /> : null}
          {secondaryAction ? <PillLink action={{ ...secondaryAction, variant: secondaryAction.variant ?? "secondary" }} arrow={false} /> : null}
        </div>
      ) : null}
    </div>
  );
}
