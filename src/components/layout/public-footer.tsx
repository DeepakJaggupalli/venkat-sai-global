import { ArrowRight, BellRing } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ContactIcons, ContactList, DEFAULT_WHATSAPP_MESSAGE, MapEmbed, resolveContact, WhatsAppIcon, type ResolvedContact } from "@/components/public/contact-links";
import { CONTACT, whatsappHref } from "@/config/contact";
import { BRAND } from "@/config/site";
import { cn } from "@/lib/utils";

import { isExternalHref } from "./nav-utils";
import { DEFAULT_LEGAL_LINKS } from "./portal-config";
import { DEFAULT_FOOTER_COLUMNS, sanitizeFooterLinks, sanitizeHref } from "./public-nav";
import type { FooterColumn, FooterLink, SocialLink, SocialPlatform } from "./types";

export type PublicFooterProps = {
  /** Link columns (default: Find work, Services, Company). */
  columns?: readonly FooterColumn[];
  /** Contact details (CMS site settings merged over src/config/contact.ts — see resolveContact()). */
  contact?: ResolvedContact;
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

const LINK_CLASS = "inline-flex items-center gap-1.5 rounded-sm text-sm text-white/75 transition-colors hover:text-yellow";
const HEADING_CLASS = "font-display text-lg uppercase tracking-wide text-white";

/**
 * Public website footer: a yellow "send your CV" strip, then the navy footer with the brand, quick contact
 * buttons, link columns, every phone number and email, the Google Map, the WhatsApp group (when configured),
 * legal links and copyright. Nothing is invented: contact details come from the business config / CMS.
 */
export function PublicFooter({
  columns = DEFAULT_FOOTER_COLUMNS,
  contact = resolveContact(null),
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
    <footer className="band-dark relative overflow-hidden bg-navy-deep text-white" aria-labelledby="site-footer-title">
      <h2 id="site-footer-title" className="sr-only">
        {BRAND.name} — site information
      </h2>

      <div className="bg-yellow text-navy">
        <div className="mx-auto flex max-w-[96rem] flex-col gap-4 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p className="font-display text-2xl uppercase sm:text-3xl">Looking for work abroad? Send your CV today.</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/send-cv"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-deep focus-visible:outline-navy"
            >
              Send your CV
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <a
              href={whatsappHref(DEFAULT_WHATSAPP_MESSAGE, contact.whatsapp.e164)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-navy px-5 text-sm font-semibold text-navy transition-colors hover:bg-navy hover:text-white focus-visible:outline-navy"
            >
              <WhatsAppIcon className="size-5" />
              WhatsApp {contact.whatsapp.display}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="stripe-hazard h-1.5" />

      <div className="relative mx-auto grid max-w-[96rem] gap-12 px-4 pt-14 pb-12 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8 lg:pt-16">
        <div className="lg:col-span-4">
          <Link href="/" className="inline-flex rounded-md">
            <span className="sr-only">{`${BRAND.name} home`}</span>
            <Logo variant="onDark" decorative className="h-10 w-auto" />
          </Link>
          <p className="mt-6 max-w-sm text-[15px] leading-7 text-white/75">
            {contact.businessName}, Autonagar, Visakhapatnam. Training, trade testing and overseas placement for skilled tradespeople.
          </p>
          <ContactIcons contact={contact} variant="dark" className="mt-6" />
          {contact.whatsappGroupUrl || CONTACT.whatsappChannelUrl ? (
            <a
              href={contact.whatsappGroupUrl ?? CONTACT.whatsappChannelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-green-strong px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-strong/90"
              data-testid="footer-whatsapp-group"
            >
              <BellRing aria-hidden="true" className="size-4 shrink-0" />
              {contact.whatsappGroupUrl ? "Join our WhatsApp group for the latest requirements" : "Follow our WhatsApp channel for the latest requirements"}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          {safeSocial.length > 0 && (
            <ul role="list" aria-label="Social media" className="mt-6 flex flex-wrap gap-2">
              {safeSocial.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center rounded-full border border-white/15 px-3.5 text-xs font-medium text-white/80 transition-colors hover:border-yellow hover:text-white"
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
          <nav aria-label="Footer" className="lg:col-span-4">
            <div className={cn("grid grid-cols-2 gap-x-6 gap-y-10", safeColumns.length >= 3 && "sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3")}>
              {safeColumns.map((column) => (
                <div key={column.title} className="min-w-0">
                  <h3 className={HEADING_CLASS}>{column.title}</h3>
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

        <div className="min-w-0 lg:col-span-4">
          <h3 className={HEADING_CLASS}>Contact</h3>
          <ContactList contact={contact} variant="dark" className="mt-4" />
          <MapEmbed contact={contact} variant="dark" className="mt-6" frameClassName="aspect-[16/9] sm:aspect-[16/9]" />
        </div>
      </div>

      <div className="relative border-t border-white/10">
        {/* Extra bottom padding on phones keeps the legal links clear of the floating WhatsApp button. */}
        <div className="mx-auto flex max-w-[96rem] flex-col gap-5 px-4 pt-6 pb-24 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:pb-6">
          <div className="space-y-1 text-xs leading-5 text-white/65">
            <p>
              © {currentYear()} {legalEntity}. All rights reserved.
            </p>
            <p>Candidates never pay to apply for a job through Venkat Sai.</p>
          </div>
          {safeLegal.length > 0 && (
            <nav aria-label="Legal" className="lg:pr-48">
              <ul role="list" className="flex flex-wrap gap-x-5 gap-y-2">
                {safeLegal.map((link) => (
                  <li key={link.href}>
                    <FooterAnchor link={link} className="rounded-sm text-xs text-white/70 transition-colors hover:text-yellow" />
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
