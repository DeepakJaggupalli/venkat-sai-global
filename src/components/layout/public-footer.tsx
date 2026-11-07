import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/config/site";
import { cn } from "@/lib/utils";

import { isExternalHref } from "./nav-utils";
import { DEFAULT_LEGAL_LINKS } from "./portal-config";
import { DEFAULT_FOOTER_COLUMNS, sanitizeFooterLinks, sanitizeHref } from "./public-nav";
import type { FooterColumn, FooterContact, FooterLink, SocialLink, SocialPlatform } from "./types";

export type PublicFooterProps = {
  /** Link columns (default: derived from PUBLIC_NAV). */
  columns?: readonly FooterColumn[];
  /** Contact details — only the fields supplied are rendered; nothing is shown by default. */
  contact?: FooterContact | null;
  /** Social profiles (http(s) links only). */
  social?: readonly SocialLink[];
  /** Copyright holder (default: the registered business behind Venkat Sai Global). */
  legalEntity?: string;
  /** Legal links (default: privacy, terms, cookie preferences, data rights, accessibility, grievance redressal). */
  legalLinks?: readonly FooterLink[];
};

const SOCIAL_LABEL: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  other: "Website",
};

/** Kept out of the component body so rendering stays pure. */
function currentYear(): number {
  return new Date().getFullYear();
}

/** Digits and a leading + only, for tel: / wa.me links. */
function dialable(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function FooterAnchor({ link, className, children }: { link: FooterLink; className?: string; children?: ReactNode }) {
  const external = isExternalHref(link.href);
  const content = children ?? link.title;
  if (external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {content}
    </Link>
  );
}

const LINK_CLASS = "rounded-sm text-sm text-white/70 transition-colors hover:text-white";

function ContactBlock({ contact }: { contact: FooterContact }) {
  const email = contact.email?.trim();
  const phone = contact.phone?.trim();
  const whatsapp = contact.whatsapp?.trim();
  const address = contact.address?.trim();
  const hours = contact.hours?.trim();
  if (!email && !phone && !whatsapp && !address && !hours) return null;

  const row = "flex items-start gap-3 text-sm text-white/70";
  const icon = "mt-0.5 size-4 shrink-0 text-teal";
  return (
    <div className="mt-8">
      <h3 className="font-heading text-sm font-semibold text-white">Contact</h3>
      <ul role="list" className="mt-4 space-y-3">
        {address && (
          <li className={row}>
            <MapPin className={icon} aria-hidden />
            <address className="whitespace-pre-line not-italic">{address}</address>
          </li>
        )}
        {email && (
          <li className={row}>
            <Mail className={icon} aria-hidden />
            <a href={`mailto:${email}`} className="break-all transition-colors hover:text-white">
              {email}
            </a>
          </li>
        )}
        {phone && (
          <li className={row}>
            <Phone className={icon} aria-hidden />
            <a href={`tel:${dialable(phone)}`} className="transition-colors hover:text-white">
              {phone}
            </a>
          </li>
        )}
        {whatsapp && (
          <li className={row}>
            <MessageCircle className={icon} aria-hidden />
            <a
              href={`https://wa.me/${dialable(whatsapp).replace("+", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white"
            >
              WhatsApp {whatsapp}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        )}
        {hours && (
          <li className={row}>
            <Clock className={icon} aria-hidden />
            <span className="whitespace-pre-line">{hours}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * Public website footer: brand promise, link columns, optional contact and social links, legal links
 * and copyright. Data will come from the CMS site settings; every prop has an honest default
 * (no contact details or social profiles are invented).
 */
export function PublicFooter({
  columns = DEFAULT_FOOTER_COLUMNS,
  contact = null,
  social = [],
  legalEntity = BRAND.legalEntity,
  legalLinks = DEFAULT_LEGAL_LINKS,
}: PublicFooterProps) {
  const safeColumns = columns
    .map((column) => ({ title: column.title, links: sanitizeFooterLinks(column.links) }))
    .filter((column) => column.links.length > 0);
  const safeSocial = social
    .map((link) => ({ ...link, href: sanitizeHref(link.href) }))
    .filter((link): link is SocialLink => !!link.href && isExternalHref(link.href));
  const safeLegal = sanitizeFooterLinks(legalLinks);

  return (
    <footer className="relative overflow-hidden bg-navy text-white" aria-labelledby="site-footer-title">
      <h2 id="site-footer-title" className="sr-only">
        {BRAND.name} — site information
      </h2>
      <FooterHorizon />

      <div className="relative mx-auto grid max-w-[96rem] gap-12 px-4 pt-16 pb-12 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8 lg:pt-20">
        <div className="lg:col-span-4">
          <Link href="/" className="inline-flex rounded-md">
            <span className="sr-only">{`${BRAND.name} home`}</span>
            <Logo variant="onDark" decorative className="h-10 w-auto" />
          </Link>
          <p className="mt-6 max-w-sm text-[15px] leading-7 text-white/75">{BRAND.promise}</p>
          <p className="mt-5 font-heading text-sm font-semibold tracking-wide text-teal">{BRAND.tagline}</p>
          {contact && <ContactBlock contact={contact} />}
          {safeSocial.length > 0 && (
            <ul role="list" aria-label="Social media" className="mt-8 flex flex-wrap gap-2">
              {safeSocial.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center rounded-full border border-white/15 px-3.5 text-xs font-medium text-white/80 transition-colors hover:border-white/35 hover:text-white"
                  >
                    {link.label?.trim() || SOCIAL_LABEL[link.platform]}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {safeColumns.length > 0 && (
          <nav aria-label="Footer" className="lg:col-span-8">
            <div
              className={cn("grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-x-8", safeColumns.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3")}
            >
              {safeColumns.map((column) => (
                <div key={column.title} className="min-w-0">
                  <h3 className="font-heading text-sm font-semibold text-white">{column.title}</h3>
                  <ul role="list" className="mt-4 space-y-3">
                    {column.links.map((link) => (
                      <li key={`${column.title}:${link.href}`}>
                        <FooterAnchor link={link} className={LINK_CLASS} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        )}
      </div>

      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-[96rem] flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="space-y-1 text-xs leading-5 text-white/60">
            <p>
              © {currentYear()} {legalEntity}. All rights reserved.
            </p>
            <p>{BRAND.headquarters}</p>
          </div>
          {safeLegal.length > 0 && (
            <nav aria-label="Legal">
              <ul role="list" className="flex flex-wrap gap-x-5 gap-y-2">
                {safeLegal.map((link) => (
                  <li key={link.href}>
                    <FooterAnchor link={link} className="rounded-sm text-xs text-white/65 transition-colors hover:text-white" />
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </div>
    </footer>
  );
}

/** Decorative horizon arc echoing the logo mark (purely visual). */
function FooterHorizon() {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 800 400"
      className="pointer-events-none absolute -top-40 -right-40 h-[28rem] w-[56rem] max-w-none text-teal opacity-[0.07] sm:-right-24"
      fill="none"
    >
      <circle cx="400" cy="400" r="300" stroke="currentColor" strokeWidth="2" />
      <circle cx="400" cy="400" r="370" stroke="currentColor" strokeWidth="1" strokeDasharray="2 10" />
      <circle cx="400" cy="400" r="230" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
