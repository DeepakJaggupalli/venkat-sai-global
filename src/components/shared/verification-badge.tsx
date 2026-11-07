import { Building2, CircleDashed, Clock3, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { TONE_STYLES, type Tone } from "./tones";
import { toVerificationState, VERIFICATION_COPY, type VerificationState } from "./verification";

const STATE_META: Record<VerificationState, { tone: Tone; icon: LucideIcon }> = {
  verified: { tone: "success", icon: ShieldCheck },
  employer_supplied: { tone: "info", icon: Building2 },
  self_declared: { tone: "neutral", icon: UserRound },
  pending_review: { tone: "warning", icon: Clock3 },
  unverified: { tone: "neutral", icon: CircleDashed },
};

type VerificationBadgeProps = {
  /** A provenance state, or a raw column value (mapped with `toVerificationState`). */
  state: VerificationState | (string & {}) | null | undefined;
  /** When the item was verified (shown in the explanation for `verified`). */
  verifiedAt?: Date | string | null;
  /** Override the label / explanation (e.g. "Provided by the institution"). */
  label?: string;
  description?: string;
  /**
   * badge: compact pill with a hover tooltip (explanation is always available to screen readers);
   * inline: icon + text without a pill (dense lists);
   * detail: pill plus the explanation as visible text (detail pages, forms).
   */
  variant?: "badge" | "inline" | "detail";
  timeZone?: string;
  className?: string;
};

/**
 * Distinguishes verified, employer-supplied, self-declared, pending and unverified information.
 *
 *   <VerificationBadge state={job.infoSource} />
 *   <VerificationBadge state={doc.verificationStatus} verifiedAt={doc.verifiedAt} variant="detail" />
 */
export function VerificationBadge({ state, verifiedAt, label, description, variant = "badge", timeZone, className }: VerificationBadgeProps) {
  const resolved = toVerificationState(state);
  const meta = STATE_META[resolved];
  const copy = VERIFICATION_COPY[resolved];
  const Icon = meta.icon;
  const finalLabel = label ?? copy.label;
  const finalDescription =
    description ??
    (resolved === "verified" && verifiedAt ? `Checked by Venkat Sai on ${formatDate(verifiedAt, { timeZone })}.` : copy.description);
  const styles = TONE_STYLES[meta.tone];

  if (variant === "inline") {
    return (
      <span data-slot="verification-badge" data-state={resolved} className={cn("inline-flex items-center gap-1 text-xs font-medium", styles.text, className)}>
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {finalLabel}
        <span className="sr-only">. {finalDescription}</span>
      </span>
    );
  }

  const pill = (
    <span
      data-slot="verification-badge"
      data-state={resolved}
      className={cn("inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", styles.soft)}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {finalLabel}
      {variant === "badge" ? <span className="sr-only">. {finalDescription}</span> : null}
    </span>
  );

  if (variant === "detail") {
    return (
      <span className={cn("inline-flex flex-col items-start gap-1", className)}>
        {pill}
        <span className="text-xs text-muted-foreground">{finalDescription}</span>
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex", className)}>{pill}</span>
      </TooltipTrigger>
      {/* Hover enhancement only: the same explanation is in the badge's screen-reader text. */}
      <TooltipContent aria-hidden="true">{finalDescription}</TooltipContent>
    </Tooltip>
  );
}
