import { FileUp } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { CONTACT_BUTTON_STYLES, CallButton, WhatsAppButton } from "./contact-buttons";

/**
 * Call-to-action band: "Send your CV and trade" linking to /send-cv, plus WhatsApp and call buttons.
 * `trade` / `requirementTitle` personalise the prefilled WhatsApp message.
 */
export function QuickCvCta({ className, trade, requirementTitle }: { className?: string; trade?: string; requirementTitle?: string }) {
  const about = requirementTitle ? ` about "${requirementTitle}"` : trade ? ` about ${trade} jobs` : " about overseas jobs";
  const message = `Hello Venkat Sai, I would like to know more${about}.`;
  return (
    <section aria-labelledby="quick-cv-heading" className={cn("band-dark bg-navy-deep py-10 text-white sm:py-12", className)} data-testid="quick-cv-cta">
      <div className="container-page flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 id="quick-cv-heading" className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Looking for a job abroad? Send your CV and trade.
          </h2>
          <p className="mt-2 text-base leading-relaxed text-white/80">It takes two minutes and no account. Our team will call you back. We never charge candidates to apply.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <WhatsAppButton message={message} />
          <CallButton className="border border-white/30 bg-white/5 hover:bg-white/10" />
          <Link href="/send-cv" className={cn(CONTACT_BUTTON_STYLES.call, "bg-yellow text-navy hover:bg-white")} data-testid="send-cv-link">
            <FileUp aria-hidden="true" />
            Send your CV and trade
          </Link>
        </div>
      </div>
    </section>
  );
}
