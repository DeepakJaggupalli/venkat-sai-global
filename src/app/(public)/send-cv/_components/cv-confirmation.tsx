"use client";

import { CheckCircle2, FilePlus2, FileText, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { JobAlertsButton } from "@/components/public/push/job-alerts-button";
import { CallButton, EmailButton, FollowWhatsAppLink, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import type { CvSubmissionResult } from "@/modules/operations/cv-submission-schemas";

/** The prefilled WhatsApp message to the office after applying (says the CV follows when none was attached). */
function confirmationWhatsAppMessage(result: Pick<CvSubmissionResult, "code" | "name" | "trade" | "requirementTitle" | "hasCv">): string {
  const parts = [
    result.hasCv ? "Hello Venkat Sai, I have sent my CV on your website." : "Hello Venkat Sai, I have applied on your website. I am sending my CV here.",
    result.name ? `Name: ${result.name}.` : null,
    result.trade ? `Trade: ${result.trade}.` : null,
    result.requirementTitle ? `Requirement: ${result.requirementTitle}.` : null,
    result.code ? `Reference: ${result.code}.` : null,
  ];
  return parts.filter(Boolean).join(" ");
}

/**
 * Shown after an application was accepted: the team will call; WhatsApp (prefilled with name, trade and reference),
 * call, group. Without a CV file the WhatsApp step comes first: "send your CV here".
 */
export function CvConfirmation({
  result,
  whatsappGroupUrl,
}: {
  result: Pick<CvSubmissionResult, "code" | "name" | "trade" | "requirementTitle" | "hasCv"> & { uploadToken?: string | null };
  whatsappGroupUrl: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const message = confirmationWhatsAppMessage(result);
  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="rounded-2xl border border-success/40 bg-success-soft p-6 focus:outline-none sm:p-8" data-testid="cv-confirmation">
      <CheckCircle2 className="size-10 text-success-strong" aria-hidden="true" />
      <h2 className="mt-4 font-heading text-2xl font-bold text-navy">
        Thank you{result.name ? `, ${result.name}` : ""}. {result.hasCv ? "We have received your CV." : "We have received your application."}
      </h2>
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
      {!result.hasCv ? (
        <div className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-5" data-testid="send-cv-later">
          <h3 className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
            <MessageCircle className="size-5 shrink-0 text-success-strong" aria-hidden="true" />
            Send your CV on WhatsApp
          </h3>
          <p className="mt-1 text-sm text-foreground">Tap the button below, then attach your CV (a photo or PDF) in WhatsApp. Your name and reference are already in the message.</p>
          <WhatsAppButton message={message} label="Send my CV on WhatsApp" className="mt-3 min-h-14 w-full text-lg sm:w-auto" />
        </div>
      ) : null}
      {result.code ? (
        <p className="mt-3 text-base text-foreground" data-testid="cv-status-link">
          Keep this reference. You can{" "}
          <Link href={`/status?ref=${encodeURIComponent(result.code)}`} prefetch={false} className="font-medium text-navy underline underline-offset-4">
            check your application status
          </Link>{" "}
          any time with your mobile number and this reference.
        </p>
      ) : null}
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
        {result.hasCv ? <WhatsAppButton message={message} className="min-h-14 text-lg" /> : null}
        <CallButton label="Call us" className="min-h-14 text-lg" />
        <EmailButton subject={result.code ? `Application ${result.code}` : "My application"} />
      </div>
      <FollowWhatsAppLink groupUrl={whatsappGroupUrl} className="mt-4 w-full sm:w-auto" />
      <JobAlertsButton defaultTrade={result.trade} className="mt-4" />
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
