"use client";

import { Check, CheckCircle2, Copy, ListChecks } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { WhatsAppIcon } from "@/components/public/contact-links";
import { cn } from "@/lib/utils";
import { referralWhatsAppShareHref, type ReferrerLinkResult } from "@/modules/referrals/schemas";

import { PILL_LIGHT, TEXT_BUTTON } from "./styles";

async function copyText(text: string, fallback: HTMLInputElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Insecure context or permission denied: fall back to selecting the field.
  }
  if (!fallback) return false;
  fallback.focus();
  fallback.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

/**
 * The personal link after "Get my link": Share on WhatsApp (the person picks the chat or group), Copy link, the code
 * to keep, and a shortcut to "Check my referrals". Takes focus so screen readers hear the result.
 */
export function ShareLinkCard({ result, onSeeReferrals, onStartAgain }: { result: ReferrerLinkResult; onSeeReferrals: () => void; onStartAgain: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    if (copied === "idle") return;
    const timer = window.setTimeout(() => setCopied("idle"), 3000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => setCopied((await copyText(result.url, input.current)) ? "copied" : "failed");

  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="space-y-5 focus:outline-none" data-testid="referral-link-result">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-7 shrink-0 text-success-strong" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="get-link-heading" className="font-display text-2xl text-foreground sm:text-3xl">
            {result.returning ? `Welcome back${result.firstName ? `, ${result.firstName}` : ""}. Here is your link.` : `${result.firstName ? `${result.firstName}, your` : "Your"} link is ready.`}
          </h2>
          <p className="mt-2 text-base text-muted-foreground">Send it to friends and groups looking for work abroad. When they send their CV through it, we know you referred them.</p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="referral-link" className="text-sm font-medium text-foreground">
          Your link
        </label>
        <input
          id="referral-link"
          ref={input}
          readOnly
          value={result.url}
          onFocus={(e) => e.currentTarget.select()}
          translate="no"
          className="h-12 w-full min-w-0 rounded-xl border border-border bg-surface-subtle px-3 font-mono text-base text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          data-testid="referral-link"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <a href={referralWhatsAppShareHref(result.url)} target="_blank" rel="noopener noreferrer" className={cn(PILL_LIGHT, "min-h-14 border-foreground/25 text-lg")} data-testid="referral-share-whatsapp">
          <WhatsAppIcon className="text-green-strong" />
          <span>Share on WhatsApp</span>
          <span className="sr-only"> (opens WhatsApp)</span>
        </a>
        <button type="button" onClick={copy} className={cn(PILL_LIGHT, "min-h-14 text-lg")} data-testid="referral-copy">
          {copied === "copied" ? <Check aria-hidden="true" className="text-success-strong" /> : <Copy aria-hidden="true" />}
          {copied === "copied" ? "Link copied" : "Copy link"}
        </button>
      </div>
      {/* Inside the card's status region, so the copy result is announced too. */}
      <p className="min-h-5 text-sm text-muted-foreground">
        {copied === "copied" ? "The link is copied. Paste it in WhatsApp, SMS or anywhere." : copied === "failed" ? "Could not copy. Press and hold the link above to copy it." : ""}
      </p>

      <div className="rounded-2xl border border-border bg-surface-subtle p-4">
        <p className="text-sm text-foreground">
          Your code is{" "}
          <strong className="font-mono text-base tracking-wider" translate="no" data-testid="referral-code">
            {result.code}
          </strong>
          . Keep it: with your mobile number it shows who sent a CV through your link.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4">
          <button type="button" onClick={onSeeReferrals} className={TEXT_BUTTON} data-testid="referral-see-mine">
            <ListChecks className="size-4" aria-hidden="true" />
            See my referrals
          </button>
          <button type="button" onClick={onStartAgain} className={TEXT_BUTTON}>
            Use another number
          </button>
        </div>
      </div>
    </div>
  );
}
