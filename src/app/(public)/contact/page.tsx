import { Building2, Clock, Handshake, LifeBuoy, Mail, MapPin, MessageCircle, Phone, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { BRAND } from "@/config/site";
import { isAllowedMapEmbedUrl } from "@/modules/content/embeds";

import { JsonLd } from "../news/_components/json-ld";
import { PublicHero } from "../news/_components/public-hero";
import { abs, listingMetadata, loadSiteSettings, type PageSearchParams } from "../news/_lib/cms";
import { pickParam, telHref, whatsappHref } from "../news/_lib/text";
import { ContactForm } from "./_components/contact-form";
import { MapEmbed } from "./_components/map-embed";
import { CONTACT_TYPE_VALUES } from "./_lib/enquiry-types";

export const metadata: Metadata = listingMetadata(
  "Contact us",
  "Contact Venkat Sai Global about hiring, recruitment partnerships, training, candidate support or media enquiries.",
  "/contact",
);

function mapProvider(url: string): string {
  return /openstreetmap\.org/i.test(url) ? "OpenStreetMap" : "Google Maps";
}

function DetailRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-teal-strong [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="font-medium break-words text-foreground">{children}</dd>
      </div>
    </div>
  );
}

const QUICK_LINKS = [
  { href: "/employers/request", title: "Post a workforce requirement", description: "Employers: tell us the roles, numbers and locations you need.", icon: <Building2 /> },
  { href: "/support", title: "Get support", description: "Help with your account, applications or documents.", icon: <LifeBuoy /> },
  { href: "/grievance", title: "Raise a grievance", description: "Formal complaints, with timelines and a grievance officer.", icon: <ShieldAlert /> },
  { href: "/safe-recruitment", title: "Safe recruitment", description: "We never charge candidates. Learn the warning signs of fraud.", icon: <ShieldCheck /> },
];

export default async function ContactPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const initialType = pickParam(sp.type, CONTACT_TYPE_VALUES) ?? "general";
  const settings = await loadSiteSettings();
  const contact = settings?.contact;
  const mapUrl = contact?.mapEmbedUrl && isAllowedMapEmbedUrl(contact.mapEmbedUrl) ? contact.mapEmbedUrl : null;
  const whatsapp = contact?.whatsappNumber ? whatsappHref(contact.whatsappNumber) : null;
  const address = contact?.address || settings?.legalEntity?.registeredAddress || null;
  const hasDetails = Boolean(contact?.phone || contact?.email || whatsapp || address || contact?.businessHours);
  const legalName = settings?.legalEntity?.name || BRAND.legalEntity;

  const contactPoints = [
    contact?.phone || contact?.email
      ? { "@type": "ContactPoint", contactType: "customer support", ...(contact?.phone ? { telephone: contact.phone } : {}), ...(contact?.email ? { email: contact.email } : {}) }
      : null,
  ].filter(Boolean);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: BRAND.name,
          legalName,
          url: abs("/"),
          ...(address ? { address: { "@type": "PostalAddress", streetAddress: address } } : {}),
          ...(contactPoints.length ? { contactPoint: contactPoints } : {}),
        }}
      />
      <PublicHero
        eyebrow="Contact"
        title="Talk to Venkat Sai Global"
        description="Questions about hiring, partnerships, training or your application? Send us a message and our team will reply."
        breadcrumbs={[{ label: "Contact" }]}
      />
      <div className="container-page grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 rounded-xl border border-border/80 bg-card p-5 shadow-xs sm:p-8">
          <ContactForm initialType={initialType} />
        </div>

        <aside className="space-y-6" aria-label="Contact details">
          <section aria-labelledby="contact-details-title" className="rounded-xl border border-border/80 bg-card p-6">
            <h2 id="contact-details-title" className="font-heading text-lg font-semibold text-navy">
              Contact details
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{legalName}</p>
            {hasDetails ? (
              <dl className="mt-5 space-y-4">
                {contact?.phone ? (
                  <DetailRow icon={<Phone />} label="Phone">
                    <a href={telHref(contact.phone)} className="hover:underline">
                      {contact.phone}
                    </a>
                  </DetailRow>
                ) : null}
                {contact?.email ? (
                  <DetailRow icon={<Mail />} label="Email">
                    <a href={`mailto:${contact.email}`} className="hover:underline">
                      {contact.email}
                    </a>
                  </DetailRow>
                ) : null}
                {whatsapp && contact?.whatsappNumber ? (
                  <DetailRow icon={<MessageCircle />} label="WhatsApp">
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {contact.whatsappNumber}
                      <span className="sr-only"> (opens WhatsApp in a new tab)</span>
                    </a>
                  </DetailRow>
                ) : null}
                {address ? (
                  <DetailRow icon={<MapPin />} label="Address">
                    <span className="whitespace-pre-line">{address}</span>
                  </DetailRow>
                ) : null}
                {contact?.businessHours ? (
                  <DetailRow icon={<Clock />} label="Business hours">
                    <span className="whitespace-pre-line">{contact.businessHours}</span>
                  </DetailRow>
                ) : null}
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Our phone and email details will be listed here soon. The form is the quickest way to reach us; we reply to every message.
              </p>
            )}
            {!address ? (
              <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {BRAND.headquarters}
              </p>
            ) : null}
          </section>

          {mapUrl ? <MapEmbed src={mapUrl} title={`Map: ${legalName}`} provider={mapProvider(mapUrl)} /> : null}

          <section aria-labelledby="contact-quick-title" className="rounded-xl border border-border/80 bg-surface-subtle p-6">
            <h2 id="contact-quick-title" className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
              <Handshake className="size-5 text-teal" aria-hidden="true" />
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
    </>
  );
}
