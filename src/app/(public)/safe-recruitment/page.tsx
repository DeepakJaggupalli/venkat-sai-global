import { AlertTriangle, BadgeCheck, ExternalLink, Flag, Landmark, ListChecks, ShieldCheck, Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { LOCALE_LABELS } from "@/i18n/config";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

import { JsonLd } from "../news/_components/json-ld";
import { PublicHero } from "../news/_components/public-hero";
import { abs, breadcrumbJsonLd, type PageSearchParams } from "../news/_lib/cms";
import { getSafetyT, SAFETY_LOCALES } from "./_lib/i18n";

/** Official Government of India sources only. */
const EMIGRATE_URL = "https://emigrate.gov.in/";
const MEA_URL = "https://www.mea.gov.in/";
const MADAD_URL = "https://madad.gov.in/";
const CYBERCRIME_URL = "https://cybercrime.gov.in/";

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const { t, locale } = await getSafetyT(sp.lang);
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: {
      canonical: locale === "en" ? "/safe-recruitment" : `/safe-recruitment?lang=${locale}`,
      languages: { en: "/safe-recruitment", hi: "/safe-recruitment?lang=hi", te: "/safe-recruitment?lang=te" },
    },
    openGraph: { type: "article", title: t("meta.title"), description: t("meta.description"), url: "/safe-recruitment" },
  };
}

function officialDomain(): string | null {
  try {
    return new URL(env().APP_URL).hostname;
  } catch {
    return null;
  }
}

function Section({ id, icon, title, children, className }: { id: string; icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24 rounded-xl border border-border/80 bg-card p-6 sm:p-8", className)}>
      <h2 id={`${id}-title`} className="flex items-center gap-3 font-heading text-xl font-semibold text-navy sm:text-2xl">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-teal-strong [&_svg]:size-5" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-base leading-7">{children}</div>
    </section>
  );
}

function OfficialLink({ href, children, note }: { href: string; children: ReactNode; note: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-teal-strong underline underline-offset-2 hover:no-underline">
      {children}
      <ExternalLink className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{note}</span>
    </a>
  );
}

export default async function SafeRecruitmentPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const { t, locale } = await getSafetyT(sp.lang);
  const domain = officialDomain();
  const ext = t("help.external");
  const signs = ["fee", "email", "pressure", "noInterview", "passport", "visitVisa", "noContract", "unregistered"] as const;

  return (
    <div lang={locale}>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", url: abs("/") }, { name: t("breadcrumb"), url: abs("/safe-recruitment") }])} />
      <PublicHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        description={t("hero.description")}
        breadcrumbs={[{ label: t("breadcrumb") }]}
        actions={
          <>
            <Button asChild size="lg">
              <Link href="/grievance#raise">
                <Flag aria-hidden="true" />
                {t("hero.report")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#verify-agent">{t("hero.verify")}</a>
            </Button>
          </>
        }
      >
        <nav aria-label={t("language.label")} className="mt-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("language.label")}:</span>
          {SAFETY_LOCALES.map((code) => (
            <Link
              key={code}
              href={code === "en" ? "/safe-recruitment?lang=en" : `/safe-recruitment?lang=${code}`}
              hrefLang={code}
              lang={code}
              aria-current={code === locale ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 font-medium transition-colors",
                code === locale ? "border-navy bg-navy text-white" : "border-border bg-white text-foreground hover:border-navy/40",
              )}
            >
              {LOCALE_LABELS[code].label}
            </Link>
          ))}
        </nav>
      </PublicHero>

      <div className="container-page max-w-4xl space-y-8 py-10 sm:py-14">
        <Section id="promise" icon={<ShieldCheck />} title={t("promise.title")} className="border-teal/40 bg-teal-soft/30">
          <ul className="space-y-3">
            {(["free", "noTestFee", "noCourseCondition", "official"] as const).map((key) => (
              <li key={key} className="flex gap-3">
                <BadgeCheck className="mt-1 size-5 shrink-0 text-success-strong" aria-hidden="true" />
                <span>{t(`promise.${key}`)}</span>
              </li>
            ))}
            {domain ? (
              <li className="flex gap-3">
                <BadgeCheck className="mt-1 size-5 shrink-0 text-success-strong" aria-hidden="true" />
                <span>{t("promise.domain", { domain })}</span>
              </li>
            ) : null}
          </ul>
        </Section>

        <Section id="how-fraud-works" icon={<Workflow />} title={t("how.title")}>
          <p>{t("how.intro")}</p>
          <ol className="space-y-3">
            {(["step1", "step2", "step3", "step4"] as const).map((key, i) => (
              <li key={key} className="flex gap-3">
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <span>{t(`how.${key}`)}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="warning-signs" icon={<AlertTriangle />} title={t("signs.title")} className="border-warning/40">
          <ul className="grid gap-3 sm:grid-cols-2">
            {signs.map((key) => (
              <li key={key} className="flex gap-3 rounded-lg bg-warning-soft/60 p-4 text-[15px] leading-6">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-strong" aria-hidden="true" />
                <span>{t(`signs.${key}`)}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="verify-agent" icon={<ListChecks />} title={t("verify.title")}>
          <p>{t("verify.intro")}</p>
          <ol className="list-decimal space-y-2 pl-6">
            {(["step1", "step2", "step3", "step4"] as const).map((key) => (
              <li key={key}>{t(`verify.${key}`)}</li>
            ))}
          </ol>
          <p>
            <OfficialLink href={EMIGRATE_URL} note={ext}>
              {t("verify.portal")}
            </OfficialLink>
          </p>
          <p className="rounded-lg bg-surface-subtle p-4 text-sm leading-6">{t("verify.jobs")}</p>
        </Section>

        <Section id="government-help" icon={<Landmark />} title={t("help.title")}>
          <p>{t("help.pbsk")}</p>
          <p>{t("help.madad")}</p>
          <p>{t("help.cyber")}</p>
          <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
            <li>
              <OfficialLink href={MEA_URL} note={ext}>
                {t("help.mea")}
              </OfficialLink>
            </li>
            <li>
              <OfficialLink href={EMIGRATE_URL} note={ext}>
                eMigrate
              </OfficialLink>
            </li>
            <li>
              <OfficialLink href={MADAD_URL} note={ext}>
                {t("help.madadLink")}
              </OfficialLink>
            </li>
            <li>
              <OfficialLink href={CYBERCRIME_URL} note={ext}>
                {t("help.cyberLink")}
              </OfficialLink>
            </li>
          </ul>
        </Section>

        <Section id="report" icon={<Flag />} title={t("report.title")} className="border-navy/20">
          <p>{t("report.body")}</p>
          <p>{t("report.keep")}</p>
          <p>{t("report.how")}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild>
              <Link href="/grievance#raise">{t("report.cta")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/contact?type=candidate_support">{t("report.contact")}</Link>
            </Button>
          </div>
        </Section>

        <p className="text-sm text-muted-foreground">{t("disclaimer")}</p>
      </div>
    </div>
  );
}
