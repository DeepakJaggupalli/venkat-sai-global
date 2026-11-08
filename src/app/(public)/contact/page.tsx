import { Building2, FileText, Handshake, LifeBuoy, MapPin, Phone, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ContactList, DEFAULT_WHATSAPP_MESSAGE, MapEmbed, WhatsAppIcon } from "@/components/public/contact-links";
import { loadSiteContact } from "@/components/public/services/contact-data";
import { telHref, whatsappHref } from "@/config/contact";
import { BRAND } from "@/config/site";

import { JsonLd } from "../news/_components/json-ld";
import { PublicHero } from "../news/_components/public-hero";
import { abs, listingMetadata, type PageSearchParams } from "../news/_lib/cms";
import { pickParam } from "../news/_lib/text";
import { ContactForm } from "./_components/contact-form";
import { CONTACT_TYPE_VALUES } from "./_lib/enquiry-types";

export const metadata: Metadata = listingMetadata(
  "Contact us",
  "Call, WhatsApp, email or visit Venkat Sai Welding Works and Testing Center, B-Block, Plot D-6, Autonagar, Gajuwaka, Visakhapatnam, about jobs abroad, training, internships or manpower supply.",
  "/contact",
);

const QUICK_LINKS = [
  { href: "/send-cv", title: "Send your CV and trade", description: "Candidates: the quickest way to be considered for our requirements.", icon: <FileText /> },
  { href: "/employers/request", title: "Request manpower", description: "Companies: tell us the trades, numbers and locations you need.", icon: <Building2 /> },
  { href: "/support", title: "Get support", description: "Help with your account, applications or documents.", icon: <LifeBuoy /> },
  { href: "/grievance", title: "Raise a grievance", description: "Formal complaints, with timelines and a grievance officer.", icon: <ShieldAlert /> },
  { href: "/safe-recruitment", title: "Safe recruitment", description: "We never charge candidates. Learn the warning signs of fraud.", icon: <ShieldCheck /> },
];

export default async function ContactPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const initialType = pickParam(sp.type, CONTACT_TYPE_VALUES) ?? "general";
  const { contact, legalName } = await loadSiteContact();
  const name = legalName || BRAND.legalEntity;
  const mainPhone = contact.phones[0] ?? contact.whatsapp;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: BRAND.name,
          legalName: name,
          url: abs("/"),
          address: { "@type": "PostalAddress", streetAddress: contact.addressLines.join(", "), addressCountry: "IN" },
          contactPoint: contact.phones.map((p, i) => ({
            "@type": "ContactPoint",
            contactType: "customer support",
            telephone: p.e164,
            ...(i === 0 ? { email: contact.emails[0] } : {}),
          })),
        }}
      />
      <PublicHero
        eyebrow="Contact"
        title="Talk to Venkat Sai"
        description="Call, WhatsApp or email us, visit our centre in Autonagar, Gajuwaka, or send a message below. We reply to every message."
        breadcrumbs={[{ label: "Contact" }]}
      />

      <div className="container-page pt-8 sm:pt-10">
        <div className="flex flex-wrap gap-3" data-testid="contact-quick-actions">
          <a
            href={whatsappHref(DEFAULT_WHATSAPP_MESSAGE, contact.whatsapp.e164)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-navy px-5 text-sm font-semibold text-white hover:bg-navy-deep"
          >
            <WhatsAppIcon className="size-5" />
            WhatsApp {contact.whatsapp.display}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a href={telHref(mainPhone.e164)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-navy/20 bg-white px-5 text-sm font-semibold text-navy hover:border-navy/40">
            <Phone aria-hidden="true" className="size-4" />
            Call {mainPhone.display}
          </a>
          <a
            href={contact.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-navy/20 bg-white px-5 text-sm font-semibold text-navy hover:border-navy/40"
          >
            <MapPin aria-hidden="true" className="size-4" />
            Open in Google Maps
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>

      <div className="container-page grid gap-10 py-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 rounded-xl border border-border/80 bg-card p-5 shadow-xs sm:p-8">
          <ContactForm initialType={initialType} />
        </div>

        <aside className="space-y-6" aria-label="Contact details">
          <section aria-labelledby="contact-details-title" className="rounded-xl border border-border/80 bg-card p-6" data-testid="contact-details">
            <h2 id="contact-details-title" className="font-heading text-lg font-semibold text-navy">
              Contact details
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{name}</p>
            <ContactList contact={contact} className="mt-5" />
          </section>

          <section aria-labelledby="contact-quick-title" className="rounded-xl border border-border/80 bg-surface-subtle p-6">
            <h2 id="contact-quick-title" className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
              <Handshake className="size-5 text-teal-strong" aria-hidden="true" />
              Looking for something specific?
            </h2>
            <ul className="mt-4 space-y-4">
              {QUICK_LINKS.map((link) => (
                <li key={link.href} className="flex gap-3">
                  <span className="mt-0.5 text-teal-strong [&_svg]:size-4" aria-hidden="true">
                    {link.icon}
                  </span>
                  <div>
                    <Link href={link.href} className="font-semibold text-navy underline-offset-4 hover:underline">
                      {link.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">{link.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <section aria-labelledby="contact-map-title" className="container-page pb-14 sm:pb-20">
        <h2 id="contact-map-title" className="font-heading text-xl font-semibold text-navy">
          Find our centre
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{contact.addressLines.join(", ")}</p>
        <MapEmbed contact={contact} className="mt-5" frameClassName="sm:aspect-[21/9]" />
      </section>
    </>
  );
}
