import { BellRing } from "lucide-react";

import { ContactIcons, ContactList, MapEmbed, WhatsAppIcon, type ResolvedContact } from "../contact-links";
import { CtaLink } from "../cta-link";
import { Section, SectionHeading } from "../section";

/** "Join our WhatsApp group" band — only when the CMS site settings hold a group link. */
/** WhatsApp group band; falls back to the official WhatsApp channel when no group link is configured. */
export function WhatsAppGroupBand({ url, kind = "group", heading, intro }: { url: string | null; kind?: "group" | "channel"; heading?: string | null; intro?: string | null }) {
  if (!url) return null;
  const isChannel = kind === "channel";
  return (
    <section aria-labelledby="home-wa-group-title" className="band-dark relative isolate overflow-hidden bg-green-strong py-12 text-white sm:py-14" data-testid="home-whatsapp-group">
      <div aria-hidden="true" className="absolute -top-20 -right-16 -z-10 size-72 rounded-full bg-white/10" />
      <div className="container-page flex flex-col gap-6 md:flex-row md:items-center md:justify-between" data-reveal>
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white text-green-strong">
            <BellRing className="size-7" />
          </span>
          <div>
            <h2 id="home-wa-group-title" className="font-display text-3xl uppercase sm:text-4xl">
              {heading || (isChannel ? "Follow our WhatsApp channel" : "Join our WhatsApp group")}
            </h2>
            <p className="mt-2 max-w-xl text-white/90">{intro || "Get the latest job requirements on your phone as soon as we post them."}</p>
          </div>
        </div>
        <CtaLink href={url} cta={isChannel ? "whatsapp_channel" : "whatsapp_group"} location="home_whatsapp_group" variant="onDark" className="min-h-14 shrink-0 border-white bg-white px-7 text-base text-green-strong hover:bg-white/90">
          <WhatsAppIcon className="size-5" />
          {isChannel ? "Follow the channel" : "Join the group"}
        </CtaLink>
      </div>
    </section>
  );
}

/** Contact band with every phone number, both emails, quick-action icons and the Google Map. */
export function ContactBand({ contact, heading }: { contact: ResolvedContact; heading?: string | null }) {
  return (
    <Section tone="white" labelledBy="home-contact-title" data-testid="home-contact">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
        <div data-reveal>
          <SectionHeading id="home-contact-title" eyebrow="Visit or call" title={<span className="uppercase">{heading || "Come and see us in Autonagar"}</span>} />
          <ContactList contact={contact} className="mt-8" />
          <ContactIcons contact={contact} labels className="mt-8" />
        </div>
        <div data-reveal="2">
          <MapEmbed contact={contact} className="shadow-[0_24px_60px_-30px_rgb(11_31_92/0.5)]" />
        </div>
      </div>
    </Section>
  );
}
