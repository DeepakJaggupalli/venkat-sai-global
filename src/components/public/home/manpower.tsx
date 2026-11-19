import { ArrowRight, Phone } from "lucide-react";
import Link from "next/link";

import { CONTACT, telHref, whatsappHref } from "@/config/contact";

import { WhatsAppIcon } from "../contact-links";
import { EN_MARKETING, type MarketingT } from "../marketing-i18n";
import { Section, SectionHeading, type SectionTone } from "../section";

const PILL =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

const CARDS = [
  { key: "agency", testId: "manpower-agency" },
  { key: "company", testId: "manpower-company" },
] as const;

/**
 * Each card's portal: sign-up with the account type preselected. Signed-in visitors are sent on by /sign-up to their
 * portal (/agency or /employer) or to that portal's onboarding when they do not have it yet.
 */
export const MANPOWER_PORTAL_HREF: Record<(typeof CARDS)[number]["key"], string> = {
  agency: "/sign-up?intent=travel_agency",
  company: "/sign-up?intent=employer",
};

/**
 * "Need manpower?" (anchor #manpower, linked from the hero): one card for travel agencies with a requirement from
 * abroad and one for HR teams and direct companies. Each opens its own portal (Travel Agency Portal / Company Portal)
 * and reaches the business contact (CONTACT.business) on WhatsApp, with a card-specific message, or by phone. The business number is used here only; candidates are pointed to the
 * office number.
 */
export function ManpowerSection({ tone = "white", t = EN_MARKETING }: { tone?: SectionTone; t?: MarketingT }) {
  const contact = CONTACT.business;
  return (
    <Section id="manpower" tone={tone} labelledBy="home-manpower-title" data-testid="home-manpower" className="scroll-mt-24">
      <div data-reveal>
        <SectionHeading id="home-manpower-title" eyebrow={t("manpower.eyebrow")} title={t("manpower.title")} intro={t("manpower.intro")} />
      </div>
      <ul className="mt-12 grid gap-6 md:grid-cols-2">
        {CARDS.map((card, i) => (
          <li key={card.key} data-reveal={String(i + 2)} data-testid={card.testId}>
            <article className="card-surface flex h-full flex-col rounded-3xl p-6 sm:p-8">
              <h3 className="font-display text-2xl text-foreground sm:text-[1.75rem]">{t(`manpower.${card.key}.title`)}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t(`manpower.${card.key}.body`)}</p>
              <p className="mt-6 text-sm font-medium text-foreground">{t("manpower.contact", { name: contact.name })}</p>
              <div className="mt-auto flex flex-wrap gap-3 pt-4">
                <Link
                  href={MANPOWER_PORTAL_HREF[card.key]}
                  data-testid={`${card.testId}-portal`}
                  className={`${PILL} bg-foreground text-white hover:bg-[#26262b]`}
                >
                  {t(`manpower.${card.key}.portal`)}
                  <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
                </Link>
                <a
                  href={whatsappHref(t(`manpower.${card.key}.message`, { name: contact.name }), contact.e164)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${PILL} border border-border bg-white text-foreground hover:border-[#c9cdd5] hover:bg-surface-subtle`}
                >
                  <WhatsAppIcon className="size-5 text-green-strong" />
                  {t("manpower.whatsapp")}
                  <span className="sr-only">{t("common.newTab")}</span>
                </a>
                <a
                  href={telHref(contact.e164)}
                  className={`${PILL} border border-border bg-white text-foreground hover:border-[#c9cdd5] hover:bg-surface-subtle`}
                >
                  <Phone aria-hidden="true" className="size-4" />
                  {t("manpower.call", { phone: contact.display })}
                </a>
              </div>
            </article>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-reveal>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("manpower.note", { phone: CONTACT.whatsapp.display })}</p>
        <Link href="/employers/request" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
          {t("manpower.sendDetails")}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </Section>
  );
}
