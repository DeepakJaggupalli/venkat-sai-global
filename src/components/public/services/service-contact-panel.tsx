import { Building2, FileText, Mail, Phone } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { WhatsAppIcon, type ResolvedContact } from "@/components/public/contact-links";
import { mailtoHref, telHref, whatsappHref } from "@/config/contact";
import { cn } from "@/lib/utils";

export type ServiceAudience = "candidate" | "company";

/** Prefilled WhatsApp text naming the service, so the team knows what the message is about. */
export function serviceWhatsappMessage(serviceTitle: string, audience: ServiceAudience): string {
  return audience === "company"
    ? `Hello Venkat Sai, we need manpower (${serviceTitle}). Trades and number of people: `
    : `Hello Venkat Sai, I am interested in ${serviceTitle}. My trade and experience: `;
}

function Action({ href, icon, label, detail, external, primary }: { href: string; icon: ReactNode; label: string; detail?: string; external?: boolean; primary?: boolean }) {
  const className = cn(
    "group flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2",
    primary ? "border-navy bg-navy text-white hover:bg-navy-deep" : "border-border bg-white text-navy hover:border-teal hover:bg-teal-soft/40",
  );
  const body = (
    <>
      <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5", primary ? "bg-white/10 text-white" : "bg-teal-soft text-teal-strong")}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {detail ? <span className={cn("block truncate text-xs", primary ? "text-white/75" : "text-muted-foreground")}>{detail}</span> : null}
      </span>
    </>
  );
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <a href={href} className={className} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {body}
      {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </a>
  );
}

/**
 * The ways to reach Venkat Sai about one service: the main ask (send CV and trade for candidates, a manpower
 * requirement for companies), WhatsApp with a prefilled message naming the service, email and a call.
 * Shown next to the enquiry form on service pages.
 */
export function ServiceContactPanel({
  serviceTitle,
  audience,
  contact,
  className,
  headingId,
}: {
  serviceTitle: string;
  audience: ServiceAudience;
  contact: ResolvedContact;
  className?: string;
  headingId?: string;
}) {
  const subject = audience === "company" ? `Manpower requirement: ${serviceTitle}` : `Enquiry: ${serviceTitle}`;
  return (
    <div className={cn("rounded-2xl border border-border bg-surface-subtle p-5 sm:p-6", className)}>
      <h3 id={headingId} className="font-heading text-lg font-semibold text-navy">
        {audience === "company" ? "Tell us the trades and numbers you need" : "Send your CV and trade"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {audience === "company"
          ? "Message us on WhatsApp, email or call. We reply with the next steps."
          : "The quickest way to be considered: share your CV and trade, or message us on WhatsApp."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {audience === "company" ? (
          <Action href="/employers/request" primary icon={<Building2 />} label="Submit a manpower requirement" detail="Trades, numbers and location" />
        ) : (
          <Action href="/send-cv" primary icon={<FileText />} label="Send your CV and trade" detail="Takes a few minutes" />
        )}
        <Action href={whatsappHref(serviceWhatsappMessage(serviceTitle, audience), contact.whatsapp.e164)} external icon={<WhatsAppIcon />} label="WhatsApp us" detail={contact.whatsapp.display} />
        <Action href={mailtoHref(contact.emails[0], subject)} icon={<Mail />} label="Email us" detail={contact.emails[0]} />
        <Action href={telHref(contact.phones[0]?.e164 ?? contact.whatsapp.e164)} icon={<Phone />} label="Call us" detail={contact.phones[0]?.display ?? contact.whatsapp.display} />
      </div>
    </div>
  );
}
