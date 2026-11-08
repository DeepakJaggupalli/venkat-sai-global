import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { CONTACT_BUTTON_STYLES, CallButton, WhatsAppButton } from "./contact-buttons";

/**
 * Call-to-action strip: a white card on the light-grey band with "Send your CV and trade" (black pill, /send-cv),
 * WhatsApp and call (outline pills).
 * `trade` / `requirementTitle` personalise the prefilled WhatsApp message.
 */
export function QuickCvCta({ className, trade, requirementTitle }: { className?: string; trade?: string; requirementTitle?: string }) {
  const about = requirementTitle ? ` about "${requirementTitle}"` : trade ? ` about ${trade} jobs` : " about overseas jobs";
  const message = `Hello Venkat Sai, I would like to know more${about}.`;
  return (
    <section aria-labelledby="quick-cv-heading" className={cn("bg-surface-subtle py-12 sm:py-16", className)} data-testid="quick-cv-cta">
      <div className="container-page">
        <div className="card-surface flex flex-col gap-8 rounded-3xl p-6 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 id="quick-cv-heading" className="font-display text-[1.75rem] text-foreground sm:text-4xl">
              Looking for a job abroad? Send your CV and trade.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">It takes two minutes and no account. Our team will call you back. We never charge candidates to apply.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              No proper CV yet?{" "}
              <Link href="/resume-service" className="font-semibold text-teal-strong underline underline-offset-4" data-testid="resume-service-link">
                We can prepare your resume
              </Link>{" "}
              (a paid service, separate from job applications).
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap lg:max-w-md lg:justify-end">
            <Link href="/send-cv" className={cn(CONTACT_BUTTON_STYLES.call, "group/cv")} data-testid="send-cv-link">
              Send your CV
              <ArrowRight aria-hidden="true" className="size-4! transition-transform duration-150 group-hover/cv:translate-x-0.5 motion-reduce:transition-none" />
            </Link>
            <WhatsAppButton message={message} label="WhatsApp" />
            <CallButton className={CONTACT_BUTTON_STYLES.outline} />
          </div>
        </div>
      </div>
    </section>
  );
}
