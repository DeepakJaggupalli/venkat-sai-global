"use client";

import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";
import { GENERIC_ERROR, isActionResult, isNavigationError } from "./form/action-result";
import { TONE_STYLES } from "./tones";

/** Shape a reveal Server Action may return (ActionResult<{ value }>), or a plain string. */
export type RevealResult = string | { ok: true; data?: { value: string } | null; message?: string } | { ok: false; error: string };

type MaskedValueProps = {
  /** Masked text from the server (e.g. maskEmail()). The real value is never sent until revealed. */
  masked: string;
  /** What the value is, used in labels: "email address", "phone number", "passport number". */
  label: string;
  /**
   * Fetches the real value. Must be a Server Action that authorises the viewer, logs the access with
   * logDataAccess() and returns the value (ActionResult<{ value }> or a string).
   */
  onReveal: () => Promise<RevealResult>;
  /** Render the revealed value as a mailto:/tel: link. */
  kind?: "text" | "email" | "phone";
  /** Notice shown next to the control. */
  notice?: string;
  allowCopy?: boolean;
  className?: string;
};

function extractValue(result: RevealResult): { value: string } | { error: string } {
  if (typeof result === "string") return { value: result };
  if (isActionResult(result)) {
    if (!result.ok) return { error: result.error || GENERIC_ERROR };
    const value = result.data && typeof result.data === "object" && "value" in result.data ? result.data.value : undefined;
    return typeof value === "string" && value ? { value } : { error: "This information is not available." };
  }
  return { error: GENERIC_ERROR };
}

/**
 * Masked sensitive value with an explicit, logged reveal (candidate contact details, document
 * numbers). The revealed value lives only in component state; hiding it again clears it.
 *
 *   <MaskedValue masked={maskEmail(c.email)} label="email address" kind="email" onReveal={revealCandidateEmail.bind(null, { candidateId: c.id })} />
 */
export function MaskedValue({
  masked,
  label,
  onReveal,
  kind = "text",
  notice = "Revealing is recorded in the access log.",
  allowCopy = true,
  className,
}: MaskedValueProps) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reveal = () => {
    setError(null);
    startTransition(async () => {
      try {
        const outcome = extractValue(await onReveal());
        if ("error" in outcome) setError(outcome.error);
        else setValue(outcome.value);
      } catch (err) {
        if (isNavigationError(err)) throw err;
        setError(GENERIC_ERROR);
      }
    });
  };

  const revealedContent =
    value && kind === "email" ? (
      <a href={`mailto:${value}`} className="font-medium break-all text-teal-strong underline-offset-2 hover:underline">
        {value}
      </a>
    ) : value && kind === "phone" ? (
      <a href={`tel:${value.replace(/\s+/g, "")}`} className="font-medium text-teal-strong underline-offset-2 hover:underline">
        {value}
      </a>
    ) : (
      <span className="font-medium break-all">{value}</span>
    );

  return (
    <div data-slot="masked-value" className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-live="polite" className="text-sm text-foreground">
          {value ? (
            <>
              <span className="sr-only">{label}: </span>
              {revealedContent}
            </>
          ) : (
            <>
              <span className="sr-only">{label}, hidden: </span>
              <span className="font-mono tracking-wide text-muted-foreground">{masked}</span>
            </>
          )}
        </span>
        {value ? (
          <>
            {allowCopy ? <CopyButton value={value} label={label} size="icon-xs" /> : null}
            <Button type="button" variant="ghost" size="xs" onClick={() => setValue(null)}>
              <EyeOff aria-hidden="true" />
              Hide
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="xs" onClick={reveal} aria-disabled={pending || undefined} disabled={pending}>
            {pending ? <Spinner aria-hidden="true" role="presentation" /> : <Eye aria-hidden="true" />}
            Reveal<span className="sr-only"> {label}</span>
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className={cn("text-xs", TONE_STYLES.danger.text)}>
          {error}
        </p>
      ) : (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldAlert aria-hidden="true" className="size-3.5 shrink-0" />
          {notice}
        </p>
      )}
    </div>
  );
}
