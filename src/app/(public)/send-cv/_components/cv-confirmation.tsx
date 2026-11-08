"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { CallButton, EmailButton, FollowWhatsAppLink, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import type { CvSubmissionResult } from "@/modules/operations/cv-submission-schemas";

/** Shown after a CV was accepted: the team will call; WhatsApp (prefilled with name and trade), call, group. */
export function CvConfirmation({ result, whatsappGroupUrl }: { result: Pick<CvSubmissionResult, "code" | "name" | "trade" | "requirementTitle">; whatsappGroupUrl: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const parts = [
    "Hello Venkat Sai, I have sent my CV on your website.",
    result.name ? `Name: ${result.name}.` : null,
    result.trade ? `Trade: ${result.trade}.` : null,
    result.requirementTitle ? `Requirement: ${result.requirementTitle}.` : null,
    result.code ? `Reference: ${result.code}.` : null,
  ];
  const message = parts.filter(Boolean).join(" ");
  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="rounded-2xl border border-success/40 bg-success-soft p-6 focus:outline-none sm:p-8" data-testid="cv-confirmation">
      <CheckCircle2 className="size-10 text-success-strong" aria-hidden="true" />
      <h2 className="mt-4 font-heading text-2xl font-bold text-navy">Thank you{result.name ? `, ${result.name}` : ""}. We have received your CV.</h2>
      <p className="mt-3 text-base leading-relaxed text-foreground">
        Our team will call you on the number you gave us. If you do not want to wait, message us on WhatsApp or call us now.
        {result.code ? (
          <>
            {" "}
            Your reference is{" "}
            <strong className="font-semibold tabular-nums" data-testid="cv-reference">
              {result.code}
            </strong>
            .
          </>
        ) : null}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <WhatsAppButton message={message} className="min-h-14 text-lg" />
        <CallButton label="Call us" className="min-h-14 text-lg" />
        <EmailButton subject={result.code ? `CV ${result.code}` : "My CV"} />
      </div>
      <FollowWhatsAppLink groupUrl={whatsappGroupUrl} className="mt-4 w-full sm:w-auto" />
      <p className="mt-6 text-sm text-muted-foreground">Venkat Sai never asks candidates for money to apply for a job, and no payment can guarantee a job or visa.</p>
    </div>
  );
}
