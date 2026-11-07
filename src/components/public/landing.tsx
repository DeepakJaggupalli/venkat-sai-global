import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { SafeHtml } from "@/components/shared/safe-html";

import { CheckList, CtaBand, FeatureGrid, StepList, type TitledItem } from "./blocks";
import { CtaLink } from "./cta-link";
import { PageHero, type Crumb } from "./page-hero";
import { Section, SectionHeading } from "./section";
import { settle } from "./server";
import { AudienceGlyph } from "./visuals";
import { getPublishedEntries } from "@/modules/content/queries";

/**
 * One template for the audience landing pages (/employers, /candidates, /partners, /institutions): hero,
 * benefits, eligibility, steps, page-specific sections, the audience's published FAQs and a closing CTA.
 * Copy describes how the platform works — never results, figures or names.
 */

export type LandingCta = { label: string; href: string; id: string };

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
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white" data-testid="landing-faqs">
          {faqs.map((f) => (
            <details key={f.id} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-heading text-base font-semibold text-navy focus-visible:outline-2 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
                <span>{f.title}</span>
                <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <SafeHtml html={f.data.answer} className="px-5 pb-5 text-sm" />
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
        visual={
          <div className="relative mx-auto flex aspect-square w-full max-w-sm items-center justify-center">
            <div aria-hidden="true" className="absolute inset-6 rounded-full border border-white/10" />
            <div aria-hidden="true" className="absolute inset-16 rounded-full border border-dashed border-teal/40" />
            <span className="flex size-40 items-center justify-center rounded-[2.5rem] bg-white shadow-2xl shadow-black/30">
              <AudienceGlyph variant={copy.audience} className="size-28" />
            </span>
          </div>
        }
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

      <Section tone="navy" labelledBy="landing-steps-title">
        <SectionHeading id="landing-steps-title" onDark eyebrow="How it works" title={copy.steps.title} intro={copy.steps.intro} />
        <StepList steps={copy.steps.items} onDark className="mt-12" />
        {afterSteps}
      </Section>

      {children}

      <AudienceFaqs audience={copy.faqAudience} />

      <CtaBand location={`${location}_cta_band`} heading={copy.cta.heading} body={copy.cta.body} primary={copy.cta.primary} secondary={copy.cta.secondary} />
    </>
  );
}
