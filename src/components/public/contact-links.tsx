import { Mail, MapPin, Phone } from "lucide-react";
import type { ReactNode } from "react";

import { CONTACT, mailtoHref, telHref, whatsappHref } from "@/config/contact";
import { cn } from "@/lib/utils";
import type { SiteSettingsData } from "@/modules/content/collections";

/**
 * Venkat Sai contact building blocks for every public page (server- and client-safe, no data access).
 *
 * `resolveContact()` merges the CMS site settings (contact group) over the defaults in `src/config/contact.ts`:
 * a CMS phone becomes the first number, a CMS email replaces the primary address, a CMS WhatsApp number,
 * address or map embed link replaces the default. The WhatsApp group link only comes from the CMS.
 *
 * Reusable components: `ContactIcons` (Maps / WhatsApp / Email / Call buttons that open the matching app),
 * `MapEmbed` (key-less Google Map), `ContactList` (address, phones, emails) and `WhatsAppIcon`.
 */

export type ContactPhone = { e164: string; display: string };

export type ResolvedContact = {
  businessName: string;
  phones: ContactPhone[];
  whatsapp: ContactPhone;
  emails: string[];
  addressLines: string[];
  mapsUrl: string;
  mapEmbedUrl: string;
  whatsappGroupUrl: string | null;
  hours: string | null;
};

type CmsContact = SiteSettingsData["contact"] | null | undefined;

/** "+91 94942 63388" → "+919494263388"; numbers without a country code are treated as Indian. */
export function toE164(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}

function httpsUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolveContact(cms?: CmsContact): ResolvedContact {
  const phones: ContactPhone[] = [];
  const add = (phone: ContactPhone) => {
    if (!phones.some((p) => p.e164 === phone.e164)) phones.push(phone);
  };
  // Show CMS numbers that match a known number in the familiar "94942 63388" format.
  const known = (e164: string, raw: string) => CONTACT.phones.find((p) => p.e164 === e164)?.display ?? raw.trim();
  const cmsPhone = toE164(cms?.phone);
  if (cmsPhone && cms?.phone) add({ e164: cmsPhone, display: known(cmsPhone, cms.phone) });
  CONTACT.phones.forEach((p) => add({ e164: p.e164, display: p.display }));

  const cmsWhatsapp = toE164(cms?.whatsappNumber);
  const whatsapp = cmsWhatsapp && cms?.whatsappNumber ? { e164: cmsWhatsapp, display: known(cmsWhatsapp, cms.whatsappNumber) } : { ...CONTACT.whatsapp };

  const primaryEmail = cms?.email?.trim() || CONTACT.emails.primary;
  const emails = [primaryEmail, CONTACT.emails.hr].filter((e, i, all) => all.indexOf(e) === i);

  const cmsAddress = cms?.address
    ?.split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return {
    businessName: CONTACT.businessName,
    phones,
    whatsapp,
    emails,
    // The seeded one-line address is shown in its three-line form.
    addressLines: cmsAddress?.length && !(cmsAddress.length === 1 && cmsAddress[0] === CONTACT.address.oneLine) ? cmsAddress : [...CONTACT.address.lines],
    mapsUrl: CONTACT.maps.shareUrl,
    mapEmbedUrl: httpsUrl(cms?.mapEmbedUrl) ?? CONTACT.maps.embedUrl,
    whatsappGroupUrl: httpsUrl(cms?.whatsappGroupUrl),
    hours: cms?.businessHours?.trim() || null,
  };
}

export const DEFAULT_WHATSAPP_MESSAGE = "Hello Venkat Sai, I would like to know about current job requirements.";

/** WhatsApp glyph (speech bubble with handset), drawn with currentColor. Decorative. */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn("size-5", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 20.5l1.3-4.2A8.6 8.6 0 1 1 8 19.4z" />
      <path
        d="M9.1 8.2c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.7l-.5.6c-.1.1-.1.3 0 .5.6 1 1.4 1.8 2.5 2.4.2.1.4.1.5-.1l.6-.7c.2-.2.4-.2.7-.1l1.5.7c.3.1.4.3.4.5v.5c0 .4-.1.8-.6 1.1-.5.3-1.3.5-2.1.3-1.6-.4-3.2-1.5-4.4-3-.9-1.1-1.4-2.3-1.4-3.2 0-.6.2-1.1.4-1.4z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

type IconLinkProps = { href: string; label: string; icon: ReactNode; external?: boolean; showLabel: boolean; className: string };

function IconLink({ href, label, icon, external, showLabel, className }: IconLinkProps) {
  return (
    <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={className} aria-label={showLabel ? undefined : `${label}${external ? " (opens in a new tab)" : ""}`}>
      {icon}
      {showLabel ? (
        <span>
          {label}
          {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
        </span>
      ) : null}
    </a>
  );
}

/**
 * Four buttons that open the visitor's Maps, WhatsApp, email and phone apps. Icon-only by default
 * (each has an accessible name); pass `labels` to show the text too.
 */
export function ContactIcons({
  contact = resolveContact(null),
  variant = "light",
  labels = false,
  message = DEFAULT_WHATSAPP_MESSAGE,
  className,
}: {
  contact?: ResolvedContact;
  variant?: "light" | "dark";
  labels?: boolean;
  message?: string;
  className?: string;
}) {
  const base = cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-[background-color,border-color] duration-150 [&_svg]:size-5 [&_svg]:shrink-0",
    labels ? "px-4" : "size-11",
    variant === "dark" ? "border-white/20 bg-white/5 text-white hover:border-white/50 hover:bg-white/10" : "border-border bg-white text-foreground hover:border-[#c9cdd5] hover:bg-surface-subtle",
  );
  const whatsappTone = variant === "dark" ? "" : "text-green-strong";
  return (
    <ul role="list" aria-label="Contact Venkat Sai" className={cn("flex flex-wrap gap-2", className)}>
      <li>
        <IconLink href={contact.mapsUrl} label="Open in Google Maps" icon={<MapPin aria-hidden="true" />} external showLabel={labels} className={base} />
      </li>
      <li>
        <IconLink
          href={whatsappHref(message, contact.whatsapp.e164)}
          label={`WhatsApp ${contact.whatsapp.display}`}
          icon={<WhatsAppIcon className={whatsappTone} />}
          external
          showLabel={labels}
          className={base}
        />
      </li>
      <li>
        <IconLink href={mailtoHref(contact.emails[0])} label={`Email ${contact.emails[0]}`} icon={<Mail aria-hidden="true" />} showLabel={labels} className={base} />
      </li>
      <li>
        <IconLink href={telHref(contact.phones[0]?.e164)} label={`Call ${contact.phones[0]?.display ?? ""}`.trim()} icon={<Phone aria-hidden="true" />} showLabel={labels} className={base} />
      </li>
    </ul>
  );
}

/** Key-less Google Map of the training centre, with a text link for people who cannot use the frame. */
export function MapEmbed({
  contact = resolveContact(null),
  variant = "light",
  className,
  frameClassName,
  title,
}: {
  contact?: ResolvedContact;
  variant?: "light" | "dark";
  className?: string;
  frameClassName?: string;
  title?: string;
}) {
  const dark = variant === "dark";
  return (
    <figure className={cn("overflow-hidden rounded-2xl border", dark ? "border-white/15 bg-white/5" : "border-border bg-surface-subtle", className)}>
      <iframe
        src={contact.mapEmbedUrl}
        title={title ?? `Map: ${contact.businessName}, ${contact.addressLines.join(", ")}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        className={cn("block aspect-[4/3] w-full border-0 sm:aspect-[16/10]", frameClassName)}
      />
      <figcaption className={cn("flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm", dark ? "text-white/75" : "text-muted-foreground")}>
        <span className="min-w-0">{contact.addressLines.join(", ")}</span>
        <a href={contact.mapsUrl} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline", dark ? "text-white" : "text-teal-strong")}>
          <MapPin aria-hidden="true" className="size-4" />
          Directions
          <span className="sr-only"> (opens Google Maps in a new tab)</span>
        </a>
      </figcaption>
    </figure>
  );
}

/** Address, every phone number (tel: links), both emails (mailto:) and WhatsApp. */
export function ContactList({ contact = resolveContact(null), variant = "light", className }: { contact?: ResolvedContact; variant?: "light" | "dark"; className?: string }) {
  const dark = variant === "dark";
  const row = cn("flex items-start gap-3 text-sm leading-6", dark ? "text-white/80" : "text-foreground");
  const icon = cn("mt-1 size-4 shrink-0", dark ? "text-white/70" : "text-teal-strong");
  const link = cn("rounded-sm underline-offset-4 hover:underline", dark ? "hover:text-white" : "hover:text-foreground");
  return (
    <ul role="list" className={cn("space-y-3", className)}>
      <li className={row}>
        <MapPin className={icon} aria-hidden="true" />
        <address className="not-italic">
          <span className={cn("block font-semibold", dark ? "text-white" : "text-foreground")}>{contact.businessName}</span>
          {contact.addressLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </address>
      </li>
      <li className={row}>
        <Phone className={icon} aria-hidden="true" />
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="sr-only">Phone: </span>
          {contact.phones.map((p) => (
            <a key={p.e164} href={telHref(p.e164)} className={cn(link, "tabular-nums")}>
              {p.display}
            </a>
          ))}
        </span>
      </li>
      <li className={row}>
        <Mail className={icon} aria-hidden="true" />
        <span className="flex flex-col">
          <span className="sr-only">Email: </span>
          {contact.emails.map((e) => (
            <a key={e} href={mailtoHref(e)} className={cn(link, "break-all")}>
              {e}
            </a>
          ))}
        </span>
      </li>
      <li className={row}>
        <WhatsAppIcon className={cn("mt-0.5 size-5 shrink-0", dark ? "text-white/70" : "text-green-strong")} />
        <a href={whatsappHref(DEFAULT_WHATSAPP_MESSAGE, contact.whatsapp.e164)} target="_blank" rel="noopener noreferrer" className={link}>
          WhatsApp {contact.whatsapp.display}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </li>
      {contact.hours ? (
        <li className={cn(row, "whitespace-pre-line")}>
          <span aria-hidden="true" className="w-4 shrink-0" />
          {contact.hours}
        </li>
      ) : null}
    </ul>
  );
}
