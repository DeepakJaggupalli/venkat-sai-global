import { Phone, Users } from "lucide-react";

import { PILL_BASE, PILL_PRIMARY, PILL_SECONDARY } from "@/components/dashboard/pill-link";
import { WhatsAppIcon } from "@/components/public/contact-links";
import { CONTACT, telHref, whatsappHref } from "@/config/contact";
import { cn } from "@/lib/utils";

/**
 * "Large manpower order?" card: companies and travel agencies reach Prasad, the business desk, directly on WhatsApp
 * or by phone (CONTACT.business). The prefilled message names the organisation only, never personal data.
 */
export function BulkOrderCard({ title, description, organizationName }: { title: string; description: string; organizationName: string }) {
  const { name, e164, display } = CONTACT.business;
  const message = `Hello ${name}, this is ${organizationName}. We have a large manpower order to discuss.`;
  return (
    <section aria-labelledby="bulk-order-title" data-slot="bulk-order-card" className="@container rounded-[22px] border border-border bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
          <Users className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="bulk-order-title" className="font-heading text-lg font-bold text-balance text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{description}</p>
        </div>
      </div>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{name}</span>
        <span>Business desk</span>
        <span className="font-semibold whitespace-nowrap text-foreground tabular-nums">{display}</span>
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 @md:grid-cols-2">
        <a href={whatsappHref(message, e164)} target="_blank" rel="noopener noreferrer" className={cn(PILL_BASE, PILL_PRIMARY, "px-4")}>
          <WhatsAppIcon className="size-[18px]" />
          WhatsApp {name}
          <span className="sr-only"> (opens WhatsApp in a new tab)</span>
        </a>
        <a href={telHref(e164)} className={cn(PILL_BASE, PILL_SECONDARY, "px-4")}>
          <Phone aria-hidden="true" />
          Call {name}
        </a>
      </div>
    </section>
  );
}
