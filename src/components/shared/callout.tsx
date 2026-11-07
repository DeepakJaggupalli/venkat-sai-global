import { CircleAlert, CircleCheck, Info, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { renderActionSlot } from "./action-link";
import { TONE_STYLES } from "./tones";
import type { ActionSlot } from "./types";

export type CalloutTone = "info" | "success" | "warning" | "danger" | "neutral" | "brand";

const DEFAULT_ICONS: Record<CalloutTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
  neutral: Info,
  brand: Lightbulb,
};

/** Words prefixed for screen readers so the tone is not conveyed by colour/icon alone. */
const TONE_PREFIX: Partial<Record<CalloutTone, string>> = {
  success: "Success:",
  warning: "Warning:",
  danger: "Error:",
};

type CalloutProps = {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Replace the default icon, or pass `null` to hide it. */
  icon?: ReactNode | null;
  action?: ActionSlot;
  /**
   * Live-region behaviour for messages that appear dynamically. Leave unset for static notices
   * (a static notice must not interrupt screen readers on page load).
   */
  live?: "polite" | "assertive";
  className?: string;
};

/**
 * Inline notice for contextual information, confirmations, warnings and errors.
 *
 *   <Callout tone="warning" title="Verification pending">Jobs can be published once your organisation is verified.</Callout>
 */
export function Callout({ tone = "info", title, children, icon, action, live, className }: CalloutProps) {
  const styles = TONE_STYLES[tone];
  const Icon = DEFAULT_ICONS[tone];
  const role = live === "assertive" ? "alert" : live === "polite" ? "status" : undefined;
  const prefix = TONE_PREFIX[tone];
  return (
    <div
      role={role}
      data-slot="callout"
      data-tone={tone}
      className={cn("flex gap-3 rounded-xl border p-4 text-sm", styles.surface, styles.border, className)}
    >
      {icon === null ? null : (
        <span aria-hidden="true" className={cn("mt-0.5 shrink-0 [&_svg]:size-4", styles.text)}>
          {icon ?? <Icon />}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        {title ? (
          <p className={cn("font-semibold", styles.text)}>
            {prefix ? <span className="sr-only">{prefix} </span> : null}
            {title}
          </p>
        ) : prefix ? (
          <span className="sr-only">{prefix}</span>
        ) : null}
        {children ? <div className="text-pretty text-foreground/90 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2">{children}</div> : null}
        {action ? <div className="pt-2">{renderActionSlot(action, { variant: "outline", size: "sm" })}</div> : null}
      </div>
    </div>
  );
}

/** Alias kept for readability in copy-heavy pages. */
export const Notice = Callout;
