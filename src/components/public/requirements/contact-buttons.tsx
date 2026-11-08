import { Mail, Phone } from "lucide-react";

import { CONTACT, mailtoHref, telHref, whatsappHref } from "@/config/contact";
import { cn } from "@/lib/utils";

import { WhatsAppIcon } from "../contact-links";

/**
 * WhatsApp / call / email buttons with the business contact details (src/config/contact.ts). Plain links (no
 * client JavaScript), so they work in server components, in client success screens and without JavaScript.
 * Pills: WhatsApp is a white pill with the green WhatsApp glyph, call a black pill, email an outline pill.
 */

const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-5 [&_svg]:shrink-0";

const OUTLINE = `${BASE} border border-border bg-white text-foreground hover:border-[#c9cdd5] hover:bg-surface-subtle`;

export const CONTACT_BUTTON_STYLES = {
  whatsapp: OUTLINE,
  call: `${BASE} bg-foreground text-white hover:bg-[#26262b]`,
  email: OUTLINE,
  outline: OUTLINE,
} as const;

export function WhatsAppButton({ message, label = "Chat on WhatsApp", className }: { message?: string; label?: string; className?: string }) {
  return (
    <a href={whatsappHref(message)} target="_blank" rel="noopener noreferrer" className={cn(CONTACT_BUTTON_STYLES.whatsapp, className)} data-testid="whatsapp-button">
      <WhatsAppIcon className="text-green-strong" />
      <span>{label}</span>
      <span className="sr-only"> (opens WhatsApp)</span>
    </a>
  );
}

export function CallButton({ label, className }: { label?: string; className?: string }) {
  return (
    <a href={telHref()} className={cn(CONTACT_BUTTON_STYLES.call, className)} data-testid="call-button">
      <Phone aria-hidden="true" />
      <span>{label ?? `Call ${CONTACT.whatsapp.display}`}</span>
    </a>
  );
}

export function EmailButton({ subject, label = "Email us", className }: { subject?: string; label?: string; className?: string }) {
  return (
    <a href={mailtoHref(CONTACT.emails.primary, subject)} className={cn(CONTACT_BUTTON_STYLES.email, className)} data-testid="email-button">
      <Mail aria-hidden="true" />
      <span>{label}</span>
    </a>
  );
}

/**
 * "Join our WhatsApp group" when the CMS site settings have a group link, otherwise "Follow our WhatsApp channel"
 * (CONTACT.whatsappChannelUrl).
 */
export function FollowWhatsAppLink({ groupUrl, className }: { groupUrl?: string | null; className?: string }) {
  const href = groupUrl || CONTACT.whatsappChannelUrl;
  const label = groupUrl ? "Join our WhatsApp group for latest requirements" : "Follow our WhatsApp channel for latest requirements";
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(CONTACT_BUTTON_STYLES.outline, className)} data-testid="whatsapp-follow">
      <WhatsAppIcon className="text-green-strong" />
      <span>{label}</span>
      <span className="sr-only"> (opens WhatsApp)</span>
    </a>
  );
}

/** WhatsApp first (the business is most active there), then call, then email, in a responsive row. */
export function ContactButtons({
  message,
  emailSubject,
  showEmail = true,
  className,
}: {
  /** Prefilled WhatsApp message. */
  message?: string;
  emailSubject?: string;
  showEmail?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap", className)} data-testid="contact-buttons">
      <WhatsAppButton message={message} />
      <CallButton />
      {showEmail ? <EmailButton subject={emailSubject} /> : null}
    </div>
  );
}
