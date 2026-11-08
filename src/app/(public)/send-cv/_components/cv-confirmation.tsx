"use client";

import { CheckCircle2, FilePlus2, FileText } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { CallButton, EmailButton, FollowWhatsAppLink, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import type { CvSubmissionResult } from "@/modules/operations/cv-submission-schemas";

/** Shown after a CV was accepted: the team will call; WhatsApp (prefilled with name and trade), call, group. */
export function CvConfirmation({
  result,
  whatsappGroupUrl,
}: {
  result: Pick<CvSubmissionResult, "code" | "name" | "trade" | "requirementTitle"> & { uploadToken?: string | null };
  whatsappGroupUrl: string | null;
}) {
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
      {result.uploadToken ? (
        <div className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-5" data-testid="add-documents-offer">
          <h3 className="font-heading text-lg font-semibold text-navy">Add your documents now (optional)</h3>
          <p className="mt-1 text-sm text-foreground">Certificates, licences, passport pages and a photo on white background. One file at a time; we show you how each scan should look.</p>
          <Button asChild className="mt-3 min-h-12 text-base">
            <Link href={`/send-cv/documents?t=${encodeURIComponent(result.uploadToken)}`} prefetch={false}>
              <FilePlus2 aria-hidden="true" />
              Add your documents
            </Link>
          </Button>
        </div>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <WhatsAppButton message={message} className="min-h-14 text-lg" />
        <CallButton label="Call us" className="min-h-14 text-lg" />
        <EmailButton subject={result.code ? `CV ${result.code}` : "My CV"} />
      </div>
      <FollowWhatsAppLink groupUrl={whatsappGroupUrl} className="mt-4 w-full sm:w-auto" />
      <p className="mt-6 flex items-start gap-2 text-sm text-foreground">
        <FileText className="mt-0.5 size-4 shrink-0 text-navy" aria-hidden="true" />
        <span>
          No proper CV yet?{" "}
          <Link href="/resume-service" className="font-medium text-navy underline underline-offset-4">
            We can prepare a professional resume for you
          </Link>{" "}
          (a paid service, separate from any job application).
        </span>
      </p>
      <p className="mt-6 text-sm text-muted-foreground">Venkat Sai never asks candidates for money to apply for a job, and no payment can guarantee a job or visa.</p>
    </div>
  );
}
