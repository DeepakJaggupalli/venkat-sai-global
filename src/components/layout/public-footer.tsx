import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ContactIcons, ContactList, MapEmbed, resolveContact, WhatsAppIcon, type ResolvedContact } from "@/components/public/contact-links";
import { CONTACT } from "@/config/contact";
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

const LINK_CLASS = "inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground";
const HEADING_CLASS = "text-sm font-semibold text-foreground";

/** Always offered next to the legal links: CC BY photographs must be credited. */
const IMAGE_CREDITS_LINK: FooterLink = { title: "Image credits", href: "/legal/image-credits" };

/**
 * Public website footer: calm light-grey band with the brand, quick contact buttons, the WhatsApp channel (or
 * the CMS group link), link columns, every phone number and email, the Google Map, legal links (always with
 * "Image credits") and copyright. Nothing is invented: contact details come from the business config / CMS.
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
  const legal = safeLegal.some((l) => l.href === IMAGE_CREDITS_LINK.href) ? safeLegal : [...safeLegal, IMAGE_CREDITS_LINK];
  const channelUrl = contact.whatsappGroupUrl ?? CONTACT.whatsappChannelUrl;

  return (
    <footer className="border-t border-border bg-surface-subtle" aria-labelledby="site-footer-title">
      <h2 id="site-footer-title" className="sr-only">
        {BRAND.name} — site information
      </h2>

      <div className="container-page grid gap-12 pt-16 pb-12 lg:grid-cols-12 lg:gap-10 lg:pt-20">
        <div className="lg:col-span-3">
          <Link href="/" className="inline-flex rounded-md">
            <span className="sr-only">{`${BRAND.name} home`}</span>
            <Logo decorative className="h-9 w-auto" />
          </Link>
          <p className="mt-5 max-w-sm text-[15px] leading-7 text-muted-foreground">
            {contact.businessName}, Autonagar, Visakhapatnam. Training, trade testing and overseas placement for skilled tradespeople.
          </p>
          <ContactIcons contact={contact} className="mt-6" />
          {channelUrl ? (
            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-[#c9cdd5]"
              data-testid="footer-whatsapp-group"
            >
              <WhatsAppIcon className="size-5 shrink-0 text-green-strong" />
              {contact.whatsappGroupUrl ? "Join our WhatsApp group" : "Follow our WhatsApp channel"}
              <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
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
                    className="inline-flex h-9 items-center rounded-full border border-border bg-white px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
          <nav aria-label="Footer" className="lg:col-span-5">
            <div className={cn("grid grid-cols-2 gap-x-6 gap-y-10", safeColumns.length >= 3 && "sm:grid-cols-3")}>
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
          <ContactList contact={contact} className="mt-4" />
          <MapEmbed contact={contact} className="mt-6 bg-white" frameClassName="aspect-[16/9] sm:aspect-[16/9]" />
        </div>
      </div>

      <div className="border-t border-border">
        {/* Extra bottom padding on phones keeps the legal links clear of the floating WhatsApp button. */}
        <div className="container-page flex flex-col gap-5 pt-6 pb-24 lg:flex-row lg:items-center lg:justify-between lg:pb-8">
          <div className="space-y-1 text-xs leading-5 text-muted-foreground">
            <p>
              © {currentYear()} {legalEntity}. All rights reserved.
            </p>
            <p>Candidates never pay to apply or to be placed through Venkat Sai.</p>
          </div>
          {legal.length > 0 && (
            <nav aria-label="Legal" className="lg:pr-20">
              <ul role="list" className="flex flex-wrap gap-x-5 gap-y-2">
                {legal.map((link) => (
                  <li key={link.href}>
                    <FooterAnchor link={link} className="rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground" />
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
