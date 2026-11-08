"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { CallButton, EmailButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import type { ResumeRequestResult } from "@/modules/resume-service/schemas";

/** Shown after a resume request: payment is collected by our team (WhatsApp first, then call, then email). */
export function ResumeConfirmation({ result }: { result: ResumeRequestResult }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const message = ["Hello Venkat Sai, I have asked for a resume on your website.", result.name ? `Name: ${result.name}.` : null, result.code ? `Reference: ${result.code}.` : null].filter(Boolean).join(" ");
  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="rounded-2xl border border-success/40 bg-success-soft p-6 focus:outline-none sm:p-8" data-testid="resume-confirmation">
      <CheckCircle2 className="size-10 text-success-strong" aria-hidden="true" />
      <h2 className="mt-4 font-heading text-2xl font-bold text-navy">Thank you{result.name ? `, ${result.name}` : ""}. We have received your details.</h2>
      <p className="mt-3 text-base leading-relaxed text-foreground">
        Our team will contact you on WhatsApp or phone to confirm your details and collect the payment ({result.priceLabel}). Once it is paid, we prepare your resume in Word and PDF and send you a private download link.
        {result.code ? (
          <>
            {" "}
            Your reference is{" "}
            <strong className="font-semibold tabular-nums" data-testid="resume-reference">
              {result.code}
            </strong>
            .
          </>
        ) : null}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <WhatsAppButton message={message} className="min-h-14 text-lg" />
        <CallButton label="Call us" className="min-h-14 text-lg" />
        <EmailButton subject={result.code ? `Resume ${result.code}` : "My resume request"} />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">The resume service is optional and separate from job applications. Venkat Sai never charges candidates to apply for a job, and no payment can guarantee a job or visa.</p>
    </div>
  );
}
