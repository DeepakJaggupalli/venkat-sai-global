import { CheckCircle2 } from "lucide-react";

import { CallButton, EmailButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";

/** Shown after a public requirement poster was received: staff call first, then publish. Plain links only. */
export function RequirementConfirmation({ code, companyName }: { code: string | null; companyName: string | null }) {
  const message = ["Hello Venkat Sai, I have posted a job requirement on your website.", companyName ? `Company: ${companyName}.` : null, code ? `Reference: ${code}.` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-success/40 bg-success-soft p-6 sm:p-8" data-testid="requirement-confirmation">
      <CheckCircle2 className="size-10 text-success-strong" aria-hidden="true" />
      <h2 className="mt-4 font-heading text-2xl font-bold text-navy">Thank you. We have received your requirement.</h2>
      <p className="mt-3 text-base leading-relaxed text-foreground">
        We will check it and publish it after calling you. Nothing appears on our website before that.
        {code ? (
          <>
            {" "}
            Your reference is{" "}
            <strong className="font-semibold tabular-nums" data-testid="requirement-reference">
              {code}
            </strong>
            .
          </>
        ) : null}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <WhatsAppButton message={message} className="min-h-14 text-lg" />
        <CallButton label="Call us" className="min-h-14 text-lg" />
        <EmailButton subject={code ? `Requirement ${code}` : "Job requirement"} />
      </div>
    </div>
  );
}
