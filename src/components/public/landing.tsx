import {
  Award,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileSignature,
  Globe2,
  GraduationCap,
  Handshake,
  HardHat,
  HeartHandshake,
  Inbox,
  KanbanSquare,
  Languages,
  MessageSquare,
  Plane,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { SafeHtml } from "@/components/shared/safe-html";
import { PORTAL_GUIDES, type GuidePortalKey } from "@/config/portal-guides";

import { CtaBand, FaqSummary, type TitledItem } from "./blocks";
import { CtaLink } from "./cta-link";
import { PageHero, type Crumb } from "./page-hero";
import { FitChecker } from "./playful/fit-checker";
import { PortalTour, type TourArea } from "./playful/portal-tour";
import { StepWalkthrough } from "./playful/step-walkthrough";
import { StickyStart } from "./playful/sticky-start";
import { RevealScope } from "./reveal";
import { Section, SectionHeading } from "./section";
import { settle } from "./server";
import { IMAGE_CREDITS } from "@/content/image-credits";
import { getPublishedEntries } from "@/modules/content/queries";

/**
 * One template for the audience landing pages (/candidates, /employers, /agencies, /partners, /institutions):
 * hero with quick highlights, an interactive "how it works" walkthrough, playful benefit cards, a clickable tour of
 * the portal (from the portal's "How to use" guide), a "who can join" self-check, page-specific sections, the
 * audience's published FAQs and a closing CTA, with a small "Ready to start?" pill once the visitor scrolls.
 * Copy describes how the platform works — never results, figures or names.
 */

export type LandingCta = { label: string; href: string; id: string };

type Audience = "employers" | "candidates" | "partners" | "institutions" | "agencies";

/** Stock photograph per audience (CMS media is not used on these pages). */
const AUDIENCE_PHOTO: Record<Audience, string> = {
  employers: "/images/stock/crew-2.webp",
  candidates: "/images/stock/welding-3.webp",
  partners: "/images/stock/crew-3.webp",
  institutions: "/images/stock/training-2.webp",
  agencies: "/images/stock/travel-1.webp",
};

/** The portal each audience signs in to (its guide feeds the portal tour). */
const AUDIENCE_PORTAL: Record<Audience, { key: GuidePortalKey; path: string }> = {
  candidates: { key: "talent", path: "/talent" },
  employers: { key: "employer", path: "/employer" },
  agencies: { key: "agency", path: "/agency" },
  partners: { key: "recruiter", path: "/recruiter" },
  institutions: { key: "institution", path: "/institution" },
};

/** Icons for the benefit cards and the walkthrough steps, in the order each page lists them. */
const BENEFIT_ICONS: Record<Audience, LucideIcon[]> = {
  candidates: [Search, Send, ClipboardList, GraduationCap, Languages, ShieldCheck],
  employers: [ClipboardList, HardHat, KanbanSquare, Plane, BadgeCheck, HeartHandshake],
  agencies: [HardHat, Users, KanbanSquare, Plane, Eye, HeartHandshake],
  partners: [Inbox, Send, Award, Eye, MessageSquare, ShieldCheck],
  institutions: [BookOpen, Building2, Briefcase, Award, BarChart3, Globe2],
};
const STEP_ICONS: Record<Audience, LucideIcon[]> = {
  candidates: [UserPlus, Search, HardHat, Plane],
  employers: [ClipboardList, Handshake, Search, Plane],
  agencies: [UserPlus, BadgeCheck, HardHat, Plane],
  partners: [UserPlus, BadgeCheck, FileSignature, Rocket],
  institutions: [Building2, BadgeCheck, BookOpen, Users],
};

export type LandingLabels = {
  whyUs?: string;
  whoCanJoin?: string;
  howItWorks?: string;
  questions?: string;
  faqTitle?: string;
  step?: string;
  /** Walkthrough: "Step {n} of {total}", Next, Back, Pause, Play, the last-step line and the hint. */
  stepOf?: string;
  next?: string;
  back?: string;
  pause?: string;
  play?: string;
  ready?: string;
  walkHint?: string;
  /** Portal tour heading, intro and labels ("{n} of {total}" in `explored`). */
  tourEyebrow?: string;
  tourTitle?: string;
  tourIntro?: string;
  tourExplored?: string;
  tourHowTo?: string;
  tourAllDone?: string;
  tourClickHint?: string;
  tourPreview?: string;
  tourLinks?: string;
  /** Who-can-join self-check. */
  fitHint?: string;
  fitNone?: string;
  fitYes?: string;
  /** Sticky pill prompt. */
  readyPrompt?: string;
  /** Badge on the hero photo: "{n} simple steps to start". */
  stepsBadge?: string;
};

export type LandingCopy = {
  audience: Audience;
  faqAudience: Audience;
  breadcrumbs: Crumb[];
  eyebrow: string;
  title: string;
  intro: string;
  primary: LandingCta;
  secondary?: LandingCta;
  /** Two to four short facts under the hero buttons (true for every visitor; no figures or promises). */
  highlights?: string[];
  benefits: { title: string; intro?: string; items: TitledItem[] };
  eligible?: { title: string; intro?: string; items: string[] };
  steps: { title: string; intro?: string; items: TitledItem[] };
  cta: { heading: string; body: string; primary: LandingCta; secondary?: LandingCta };
  /** Section labels in the page language (English when left out). */
  labels?: LandingLabels;
};

const fill = (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

async function AudienceFaqs({ audience, eyebrow, title }: { audience: Audience; eyebrow: string; title: string }) {
  const page = await settle(`faqs.${audience}`, () => getPublishedEntries("faqs", { category: audience, limit: 20 }), null);
  const faqs = (page?.items ?? []).filter((f) => f.title?.trim() && f.data.answer);
  if (!faqs.length) return null;
  return (
    <Section tone="white" labelledBy="landing-faq-title">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <SectionHeading id="landing-faq-title" eyebrow={eyebrow} title={title} />
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

/** Benefit cards with an icon each: they lift, tint and wiggle their icon on hover, and rise in as they scroll in. */
function BenefitCards({ items, icons }: { items: TitledItem[]; icons: LucideIcon[] }) {
  const list = items.filter((i) => i.title?.trim());
  return (
    <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="landing-benefits">
      {list.map((item, i) => {
        const Icon = icons[i] ?? Sparkles;
        return (
          <li
            key={`${item.title}-${i}`}
            data-reveal={String((i % 3) + 1)}
            className="group relative overflow-hidden rounded-2xl border border-border bg-white p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-teal/60 hover:shadow-[0_22px_45px_-28px_rgb(13_148_136/0.7)] sm:p-7"
          >
            <span aria-hidden="true" className="absolute -end-10 -top-10 size-28 rounded-full bg-teal-soft opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative flex items-start justify-between">
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-2xl bg-teal-soft text-teal-strong transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 group-hover:bg-teal group-hover:text-white"
              >
                <Icon className="size-6" />
              </span>
              <span aria-hidden="true" className="font-heading text-sm font-bold text-border transition-colors group-hover:text-teal">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="relative mt-5 font-heading text-lg font-bold tracking-tight text-foreground">{item.title}</h3>
            {item.description ? <p className="relative mt-2 text-[15px] leading-relaxed text-muted-foreground">{item.description}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function HeroHighlights({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2" data-testid="landing-highlights">
      {items.map((h, i) => (
        <li
          key={h}
          className="inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-3 py-1.5 text-sm font-medium text-navy animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
          style={{ animationDelay: `${150 + i * 110}ms`, animationDuration: "420ms" }}
        >
          <CheckCircle2 aria-hidden="true" className="size-4 text-teal-strong" />
          {h}
        </li>
      ))}
    </ul>
  );
}

/** The portal's guide areas (at most seven) as tour data; icons are rendered here so no guide code ships to the browser. */
function tourAreas(portal: GuidePortalKey): TourArea[] {
  return PORTAL_GUIDES[portal].sections.slice(0, 7).map((s) => {
    const Icon = s.icon;
    return { id: s.id, topic: s.topic, summary: s.summary, steps: s.steps, links: s.links.map((link) => link.label), icon: <Icon /> };
  });
}

export function LandingPage({ copy, children, afterSteps, heroAfter }: { copy: LandingCopy; children?: ReactNode; afterSteps?: ReactNode; heroAfter?: ReactNode }) {
  const location = `${copy.audience}_landing`;
  const l = copy.labels ?? {};
  const portal = AUDIENCE_PORTAL[copy.audience];
  const stepIcons = STEP_ICONS[copy.audience];
  const steps = copy.steps.items
    .filter((s) => s.title?.trim())
    .map((s, i) => {
      const Icon = stepIcons[i] ?? Sparkles;
      return { title: s.title!.trim(), description: s.description?.trim() ?? "", icon: <Icon /> };
    });
  const photo = IMAGE_CREDITS.find((c) => c.src === AUDIENCE_PHOTO[copy.audience]) ?? null;
  const highlights = copy.highlights?.filter(Boolean) ?? [];
  return (
    <RevealScope>
      <PageHero
        breadcrumbs={copy.breadcrumbs}
        eyebrow={copy.eyebrow}
        title={copy.title}
        intro={copy.intro}
        photo={photo}
        photoBadge={
          steps.length ? (
            <span className="vsg-float inline-flex items-center gap-2 rounded-2xl bg-white/95 px-4 py-3 text-sm font-semibold text-navy shadow-lg backdrop-blur">
              <Rocket aria-hidden="true" className="size-4 text-teal-strong" />
              {fill(l.stepsBadge ?? "{n} simple steps to start", { n: steps.length })}
            </span>
          ) : null
        }
        after={
          highlights.length || heroAfter ? (
            <>
              {highlights.length ? <HeroHighlights items={highlights} /> : null}
              {heroAfter}
            </>
          ) : undefined
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

      <Section tone="subtle" labelledBy="landing-steps-title">
        <SectionHeading id="landing-steps-title" eyebrow={l.howItWorks ?? "How it works"} title={copy.steps.title} intro={copy.steps.intro} />
        <div className="mt-10">
          <StepWalkthrough
            steps={steps}
            location={location}
            finish={copy.primary}
            labels={{
              stepOf: l.stepOf ?? "Step {n} of {total}",
              next: l.next ?? "Next",
              back: l.back ?? "Back",
              pause: l.pause ?? "Pause",
              play: l.play ?? "Play",
              ready: l.ready ?? "That's it. You're ready to start.",
              hint: l.walkHint ?? "Tap any step to see what happens",
            }}
          />
        </div>
        {afterSteps}
      </Section>

      <Section labelledBy="landing-benefits-title">
        <SectionHeading id="landing-benefits-title" eyebrow={l.whyUs ?? "Why Venkat Sai"} title={copy.benefits.title} intro={copy.benefits.intro} />
        <BenefitCards items={copy.benefits.items} icons={BENEFIT_ICONS[copy.audience]} />
      </Section>

      <Section tone="subtle" labelledBy="landing-tour-title">
        <SectionHeading
          id="landing-tour-title"
          eyebrow={l.tourEyebrow ?? "Look inside"}
          title={l.tourTitle ?? "Take a quick tour of your portal"}
          intro={l.tourIntro ?? "Click each area to see what it does and exactly how to use it. This is the portal you get after you sign up."}
        />
        <div className="mt-10">
          <PortalTour
            areas={tourAreas(portal.key)}
            path={portal.path}
            location={location}
            cta={copy.primary}
            labels={{
              explored: l.tourExplored ?? "You have explored {n} of {total} areas",
              howTo: l.tourHowTo ?? "How to use it",
              allDone: l.tourAllDone ?? "You have seen the whole portal. Ready when you are!",
              clickHint: l.tourClickHint ?? "Click any area",
              preview: l.tourPreview ?? "Preview",
              linksLabel: l.tourLinks ?? "In the menu:",
            }}
          />
        </div>
      </Section>

      {copy.eligible ? (
        <Section labelledBy="landing-eligible-title">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <SectionHeading id="landing-eligible-title" eyebrow={l.whoCanJoin ?? "Who can join"} title={copy.eligible.title} intro={copy.eligible.intro} />
            <FitChecker
              items={copy.eligible.items}
              location={location}
              cta={copy.primary}
              labels={{
                hint: l.fitHint ?? "Tap everything that describes you",
                none: l.fitNone ?? "Pick at least one to check if this is for you.",
                yes: l.fitYes ?? "Great, this is for you. Let's get you started!",
              }}
            />
          </div>
        </Section>
      ) : null}

      {children}

      <AudienceFaqs audience={copy.faqAudience} eyebrow={l.questions ?? "Questions"} title={l.faqTitle ?? "Frequently asked questions"} />

      <div data-sticky-stop>
        <CtaBand tone="subtle" location={`${location}_cta_band`} heading={copy.cta.heading} body={copy.cta.body} primary={copy.cta.primary} secondary={copy.cta.secondary} />
      </div>

      <StickyStart prompt={l.readyPrompt ?? "Ready to start?"} cta={copy.primary} location={location} />
    </RevealScope>
  );
}
