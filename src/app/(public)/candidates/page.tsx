import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LandingPage, type LandingCopy } from "@/components/public/landing";
import type { MarketingT } from "@/components/public/marketing-i18n";
import { getMarketingT } from "@/components/public/marketing-locale";
import { publicLocaleProps } from "@/components/public/public-locale";
import { SAFE_RECRUITMENT_PATH } from "@/components/public/links";
import { Section } from "@/components/public/section";
import { buildPageMetadata } from "@/components/public/server";
import type { SearchParams } from "@/lib/http";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = await getMarketingT((await searchParams).lang);
  return buildPageMetadata({ title: t("candidates.meta.title"), description: t("candidates.meta.description"), path: "/candidates" });
}

const BENEFITS = ["discover", "apply", "track", "learn", "language", "privacy"] as const;
const ELIGIBLE = ["item1", "item2", "item3", "item4", "item5", "item6"] as const;
const STEPS = ["step1", "step2", "step3", "step4"] as const;

/** Candidate landing copy in the page language (public-marketing, candidates.*). */
function candidatesCopy(t: MarketingT): LandingCopy {
  const primary = { label: t("common.buildProfile"), href: "/sign-up?intent=candidate", id: "build_career_profile" };
  const secondary = { label: t("candidates.browseJobs"), href: "/jobs", id: "explore_opportunities" };
  return {
    audience: "candidates",
    faqAudience: "candidates",
    breadcrumbs: [{ label: t("candidates.breadcrumbHome"), href: "/" }, { label: t("candidates.breadcrumb") }],
    eyebrow: t("candidates.eyebrow"),
    title: t("candidates.title"),
    intro: t("candidates.intro"),
    primary,
    secondary,
    highlights: [t("candidates.highlights.free"), t("candidates.highlights.phone"), t("candidates.highlights.track")],
    benefits: {
      title: t("candidates.benefits.title"),
      items: BENEFITS.map((key) => ({ title: t(`candidates.benefits.${key}.title`), description: t(`candidates.benefits.${key}.description`) })),
    },
    eligible: {
      title: t("candidates.eligible.title"),
      intro: t("candidates.eligible.intro"),
      items: ELIGIBLE.map((key) => t(`candidates.eligible.${key}`)),
    },
    steps: {
      title: t("candidates.steps.title"),
      items: STEPS.map((key) => ({ title: t(`candidates.steps.${key}.title`), description: t(`candidates.steps.${key}.description`) })),
    },
    cta: { heading: t("candidates.cta.heading"), body: t("candidates.cta.body"), primary, secondary },
    labels: {
      whyUs: t("landing.whyUs"),
      whoCanJoin: t("landing.whoCanJoin"),
      howItWorks: t("landing.howItWorks"),
      questions: t("common.questions"),
      faqTitle: t("landing.faqTitle"),
      step: t("common.step"),
      stepOf: t("landing.walk.stepOf"),
      next: t("landing.walk.next"),
      back: t("landing.walk.back"),
      pause: t("landing.walk.pause"),
      play: t("landing.walk.play"),
      ready: t("landing.walk.ready"),
      walkHint: t("landing.walk.hint"),
      tourEyebrow: t("landing.tour.eyebrow"),
      tourTitle: t("landing.tour.title"),
      tourIntro: t("landing.tour.intro"),
      tourExplored: t("landing.tour.explored"),
      tourHowTo: t("landing.tour.howTo"),
      tourAllDone: t("landing.tour.allDone"),
      tourClickHint: t("landing.tour.clickHint"),
      tourPreview: t("landing.tour.preview"),
      tourLinks: t("landing.tour.links"),
      fitHint: t("landing.fit.hint"),
      fitNone: t("landing.fit.none"),
      fitYes: t("landing.fit.yes"),
      readyPrompt: t("landing.readyPrompt"),
      stepsBadge: t("landing.stepsBadge"),
    },
  };
}

export default async function CandidatesPage({ searchParams }: Props) {
  // ?lang= → the visitor's saved language → English; FAQs stay as published in the CMS.
  const t = await getMarketingT((await searchParams).lang);
  return (
    <div {...publicLocaleProps(t.locale)}>
      <LandingPage
        copy={candidatesCopy(t)}
        afterSteps={<p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("candidates.age")}</p>}
      >
        <Section labelledBy="candidates-safety-title" className="py-12 sm:py-14 lg:py-16">
          <div className="flex flex-col gap-6 rounded-2xl border border-teal/40 bg-teal-soft p-6 sm:flex-row sm:items-center sm:p-8" data-testid="never-charge-notice">
            <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-strong">
              <ShieldCheck className="size-7" />
            </span>
            <div className="flex-1">
              <h2 id="candidates-safety-title" className="font-heading text-xl font-semibold text-navy">
                {t("candidates.safety.title")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{t("candidates.safety.body")}</p>
            </div>
            <Link href={SAFE_RECRUITMENT_PATH} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-foreground px-5 text-sm font-semibold text-white transition-colors hover:bg-[#26262b]">
              {t("candidates.safety.cta")}
            </Link>
          </div>
        </Section>
      </LandingPage>
    </div>
  );
}
