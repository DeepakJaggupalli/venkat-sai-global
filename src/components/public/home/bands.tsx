import { ArrowUpRight } from "lucide-react";

import { ContactIcons, ContactList, MapEmbed, WhatsAppIcon, type ResolvedContact } from "../contact-links";
import { Section, SectionHeading, type SectionTone } from "../section";

/**
 * WhatsApp group / channel card: "Join our WhatsApp group" when the CMS has a group link, otherwise the official
 * WhatsApp channel. A calm white card (no colour band). Renders nothing without a link.
 */
export function WhatsAppGroupBand({ url, kind = "group", heading, intro, className }: { url: string | null; kind?: "group" | "channel"; heading?: string | null; intro?: string | null; className?: string }) {
  if (!url) return null;
  const isChannel = kind === "channel";
  return (
    <div className={className} data-testid="home-whatsapp-group">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="card-surface lift group flex items-center gap-4 rounded-2xl p-5 focus-visible:outline-2 focus-visible:outline-offset-2 sm:p-6"
      >
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#e7f6ec] text-green-strong">
          <WhatsAppIcon className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-base font-bold tracking-tight text-foreground">{heading || (isChannel ? "Follow our WhatsApp channel" : "Join our WhatsApp group")}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{intro || "New job requirements on your phone as soon as we post them."}</span>
        </span>
        <ArrowUpRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}

/** Contact section: every phone number, both emails, quick-action buttons, the WhatsApp channel and the map. */
export function ContactBand({ tone = "subtle", contact, heading, channel }: { contact: ResolvedContact; heading?: string | null; channel?: { url: string | null; kind: "group" | "channel" } } & { tone?: SectionTone }) {
  return (
    <Section tone={tone} labelledBy="home-contact-title" data-testid="home-contact">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-16">
        <div data-reveal>
          <SectionHeading id="home-contact-title" eyebrow="Visit or call" title={heading || "Come and see us in Autonagar"} />
          <ContactList contact={contact} className="mt-8" />
          <ContactIcons contact={contact} labels className="mt-8" />
          {channel ? <WhatsAppGroupBand url={channel.url} kind={channel.kind} className="mt-8 max-w-md" /> : null}
        </div>
        <div data-reveal="2">
          <MapEmbed contact={contact} className="bg-white shadow-card" frameClassName="aspect-[4/3] sm:aspect-[16/11]" />
        </div>
      </div>
    </Section>
  );
}
