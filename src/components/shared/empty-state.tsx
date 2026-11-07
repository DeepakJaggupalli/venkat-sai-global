import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

import { renderActionSlot } from "./action-link";
import type { ActionSlot } from "./types";

type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Lucide icon element, e.g. <Briefcase />. Defaults to an inbox. Pass `null` to hide. */
  icon?: ReactNode | null;
  primaryAction?: ActionSlot;
  secondaryAction?: ActionSlot;
  /** dashed: bordered placeholder inside a page; plain: no border (inside cards/tables). */
  variant?: "dashed" | "plain";
  size?: "sm" | "md";
  /** Element for the title. Defaults to a paragraph so it never breaks the page heading outline. */
  titleAs?: "p" | "h2" | "h3";
  className?: string;
};

/**
 * Honest empty state for lists, tables and dashboards — explain what will appear here and offer the
 * next step. Never fill an empty list with placeholder data.
 *
 *   <EmptyState icon={<Briefcase />} title="No jobs yet" description="Jobs you post will appear here." primaryAction={{ label: "Post a job", href: "/employer/jobs/new" }} />
 */
export function EmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  variant = "dashed",
  size = "md",
  titleAs: Title = "p",
  className,
}: EmptyStateProps) {
  return (
    <Empty
      data-slot="empty-state"
      className={cn(
        variant === "dashed" ? "border border-dashed border-border bg-surface-subtle/60" : "border-0",
        size === "sm" ? "gap-3 p-6" : "gap-4 p-8 sm:p-10",
        className,
      )}
    >
      <EmptyHeader className="max-w-md">
        {icon === null ? null : (
          <EmptyMedia
            aria-hidden="true"
            className={cn(
              "mb-1 flex items-center justify-center rounded-xl bg-teal-soft text-teal-strong",
              size === "sm" ? "size-9 [&_svg]:size-4" : "size-11 [&_svg]:size-5",
            )}
          >
            {icon ?? <Inbox />}
          </EmptyMedia>
        )}
        <Title className={cn("font-heading font-semibold text-navy", size === "sm" ? "text-sm" : "text-base")}>{title}</Title>
        {description ? <EmptyDescription className="text-pretty">{description}</EmptyDescription> : null}
      </EmptyHeader>
      {primaryAction || secondaryAction ? (
        <EmptyContent className="max-w-md">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {renderActionSlot(primaryAction, { variant: "default" })}
            {renderActionSlot(secondaryAction, { variant: "outline" })}
          </div>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
