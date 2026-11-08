import type { ReactNode } from "react";

import { SafeHtml } from "@/components/shared/safe-html";

import { CheckList, CtaBand, FaqSummary, FeatureGrid, StepList, type TitledItem } from "./blocks";
import { CtaLink } from "./cta-link";
import { PageHero, type Crumb } from "./page-hero";
import { Section, SectionHeading } from "./section";
import { settle } from "./server";
import { IMAGE_CREDITS } from "@/content/image-credits";
import { getPublishedEntries } from "@/modules/content/queries";

/**
 * One template for the audience landing pages (/employers, /candidates, /partners, /institutions): hero,
 * benefits, eligibility, steps, page-specific sections, the audience's published FAQs and a closing CTA.
 * Copy describes how the platform works — never results, figures or names.
 */

export type LandingCta = { label: string; href: string; id: string };

/** Stock photograph per audience (CMS media is not used on these pages). */
const AUDIENCE_PHOTO: Record<LandingCopy["audience"], string> = {
  employers: "/images/stock/crew-2.webp",
  candidates: "/images/stock/welding-3.webp",
  partners: "/images/stock/crew-3.webp",
  institutions: "/images/stock/training-2.webp",
};

export type LandingCopy = {
  audience: "employers" | "candidates" | "partners" | "institutions";
  faqAudience: "employers" | "candidates" | "partners" | "institutions";
  breadcrumbs: Crumb[];
  eyebrow: string;
  title: string;
  intro: string;
  primary: LandingCta;
  secondary?: LandingCta;
  benefits: { title: string; intro?: string; items: TitledItem[] };
  eligible?: { title: string; intro?: string; items: string[] };
  steps: { title: string; intro?: string; items: TitledItem[] };
  cta: { heading: string; body: string; primary: LandingCta; secondary?: LandingCta };
};

async function AudienceFaqs({ audience }: { audience: LandingCopy["faqAudience"] }) {
  const page = await settle(`faqs.${audience}`, () => getPublishedEntries("faqs", { category: audience, limit: 20 }), null);
  const faqs = (page?.items ?? []).filter((f) => f.title?.trim() && f.data.answer);
  if (!faqs.length) return null;
  return (
    <Section tone="white" labelledBy="landing-faq-title">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <SectionHeading id="landing-faq-title" eyebrow="Questions" title="Frequently asked questions" />
        <div className="divide-y divide-border self-start border-y border-border" data-testid="landing-faqs">
          {faqs.map((f) => (
            <details key={f.id} className="group">
              <FaqSummary>{f.title}</FaqSummary>
              <SafeHtml html={f.data.answer} className="max-w-2xl pb-6 text-[15px]" />
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function LandingPage({ copy, children, afterSteps }: { copy: LandingCopy; children?: ReactNode; afterSteps?: ReactNode }) {
  const location = `${copy.audience}_landing`;
  return (
    <>
      <PageHero
        breadcrumbs={copy.breadcrumbs}
        eyebrow={copy.eyebrow}
        title={copy.title}
        intro={copy.intro}
        photo={IMAGE_CREDITS.find((c) => c.src === AUDIENCE_PHOTO[copy.audience]) ?? null}
        actions={
          <>
            <CtaLink href={copy.primary.href} cta={copy.primary.id} location={`${location}_hero`} variant="accent" arrow data-testid="landing-primary-cta">
              {copy.primary.label}
            </CtaLink>
            {copy.secondary ? (
              <CtaLink href={copy.secondary.href} cta={copy.secondary.id} location={`${location}_hero`} variant="onDark">
                {copy.secondary.label}
              </CtaLink>
            ) : null}
          </>
        }
      />

      <Section tone="subtle" labelledBy="landing-benefits-title">
        <SectionHeading id="landing-benefits-title" eyebrow="Why Venkat Sai" title={copy.benefits.title} intro={copy.benefits.intro} />
        <FeatureGrid items={copy.benefits.items} className="mt-10" />
      </Section>

      {copy.eligible ? (
        <Section labelledBy="landing-eligible-title">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <SectionHeading id="landing-eligible-title" eyebrow="Who can join" title={copy.eligible.title} intro={copy.eligible.intro} />
            <CheckList items={copy.eligible.items} columns={2} className="content-start" />
          </div>
        </Section>
      ) : null}

      <Section tone={copy.eligible ? "subtle" : "white"} labelledBy="landing-steps-title">
        <SectionHeading id="landing-steps-title" eyebrow="How it works" title={copy.steps.title} intro={copy.steps.intro} />
        <StepList steps={copy.steps.items} className="mt-14" />
        {afterSteps}
      </Section>

      {children}

      <AudienceFaqs audience={copy.faqAudience} />

      <CtaBand tone="subtle" location={`${location}_cta_band`} heading={copy.cta.heading} body={copy.cta.body} primary={copy.cta.primary} secondary={copy.cta.secondary} />
    </>
  );
}
