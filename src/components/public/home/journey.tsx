import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { whatsappHref } from "@/config/contact";
import { IMAGE_CREDITS, type ImageCredit } from "@/content/image-credits";
import { stockPhoto } from "@/content/stock-photos";

import { WhatsAppIcon } from "../contact-links";
import { CtaLink } from "../cta-link";
import { EN_MARKETING, type MarketingT } from "../marketing-i18n";
import { Section, SectionHeading, type SectionTone } from "../section";
import { StockImage } from "../stock-image";

type Text = { heading?: string | null; intro?: string | null; t?: MarketingT };

function photoBySrc(name: string): ImageCredit {
  return IMAGE_CREDITS.find((c) => c.src === `/images/stock/${name}.webp`) ?? stockPhoto("workshop");
}

const STEPS = ["how.step1", "how.step2", "how.step3", "how.step4", "how.step5"] as const;

/** Candidate journey: heading, CTA and a photograph on the left, five numbered steps on a hairline on the right. */
export function HowItWorksSection({ tone = "white", heading, intro, t = EN_MARKETING }: Text & { tone?: SectionTone }) {
  return (
    <Section tone={tone} labelledBy="home-how-title" data-testid="home-how-it-works">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start" data-reveal>
          <SectionHeading id="home-how-title" eyebrow={t("how.eyebrow")} title={heading || t("how.title")} intro={intro || t("how.intro")} />
          <div className="mt-8">
            <CtaLink href="/send-cv" cta="how_send_cv" location="home_how_it_works" variant="primary" arrow className="min-h-12 px-6 text-[15px]">
              {t("common.sendCv")}
            </CtaLink>
          </div>
          <div className="relative mt-10 hidden aspect-[16/10] overflow-hidden rounded-3xl border border-border bg-surface-subtle lg:block">
            <StockImage photo={stockPhoto("departure")} sizes="(min-width: 1024px) 40vw, 100vw" />
          </div>
        </div>
        <ol className="relative">
          {STEPS.map((step, i) => (
            <li key={step} className="relative grid grid-cols-[3rem_minmax(0,1fr)] gap-x-5 pb-10 last:pb-0" data-reveal={String(Math.min(i + 1, 4))}>
              {i < STEPS.length - 1 ? <span aria-hidden="true" className="absolute top-12 bottom-0 start-6 w-px bg-border" /> : null}
              <span aria-hidden="true" className="relative flex size-12 items-center justify-center rounded-full border border-border bg-white font-display text-base text-foreground tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="pt-2.5">
                <h3 className="font-heading text-xl font-bold tracking-tight text-foreground">
                  <span className="sr-only">{t("common.step", { n: i + 1 })}</span>
                  {t(`${step}.title`)}
                </h3>
                <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">{t(`${step}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/** Trades trained at the workshop, each with a photograph and a link to its training family page. */
const TRADE_TILES = [
  { key: "welding34", href: "/services/welding-training", photo: "welding-1" },
  { key: "welding56", href: "/services/welding-training", photo: "welding-3" },
  { key: "pipeFitting", href: "/services/pipe-fitting-training", photo: "pipe-1" },
  { key: "electrical", href: "/services/electrical-training", photo: "electrical-1" },
  { key: "rigging", href: "/services/rigging-training", photo: "rigging-2" },
  { key: "scaffolding", href: "/services/scaffolding-training", photo: "scaffolding-2" },
  { key: "ndt", href: "/services/ndt-awareness-training", photo: "inspection-1" },
  { key: "hse", href: "/services/hse-safety-training", photo: "safety-1" },
] as const;

export function TrainingTeaser({ tone = "subtle", heading, intro, t = EN_MARKETING }: Text & { tone?: SectionTone }) {
  return (
    <Section tone={tone} labelledBy="home-training-title" data-testid="home-training">
      <div data-reveal>
        <SectionHeading
          id="home-training-title"
          eyebrow={t("training.eyebrow")}
          title={heading || t("training.title")}
          intro={intro || t("training.intro")}
          action={
            // Beside the heading from md up: stacked (one width) until xl, so the heading keeps room on tablets.
            <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap md:max-w-sm md:flex-col md:items-stretch xl:max-w-none xl:flex-row xl:items-center">
              <CtaLink href="/book" cta="book_test_or_training" location="home_training" variant="primary" arrow className="min-h-12 px-6 text-center text-[15px] whitespace-normal" data-testid="home-training-book">
                {t("training.book")}
              </CtaLink>
              <CtaLink href="/training" cta="training_courses" location="home_training" variant="outline" arrow className="min-h-12 px-6 text-[15px]">
                {t("training.cta")}
              </CtaLink>
            </div>
          }
        />
      </div>
      <ul className="mt-14 grid grid-cols-1 gap-x-6 gap-y-10 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {TRADE_TILES.map((tile, i) => (
          <li key={tile.key} data-reveal={String((i % 4) + 1)}>
            <article className="group relative">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-white">
                <StockImage
                  photo={photoBySrc(tile.photo)}
                  decorative
                  sizes="(min-width: 1024px) 25vw, (min-width: 480px) 50vw, 100vw"
                  className="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
                />
              </div>
              <h3 className="mt-4 font-heading text-lg font-bold tracking-tight text-foreground">
                <Link href={tile.href} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2">
                  {t(`training.${tile.key}.title`)}
                </Link>
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`training.${tile.key}.body`)}</p>
            </article>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const EMPLOYER_POINTS = ["employers.point1", "employers.point2", "employers.point3"] as const;

/** Employer band: two columns, copy and actions on the left, a photograph on the right. */
export function EmployerBand({ tone = "white", heading, intro, whatsappE164, t = EN_MARKETING }: Text & { whatsappE164?: string } & { tone?: SectionTone }) {
  return (
    <Section tone={tone} labelledBy="home-employers-title" data-testid="home-employers">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div data-reveal>
          <SectionHeading id="home-employers-title" eyebrow={t("employers.eyebrow")} title={heading || t("employers.title")} intro={intro || t("employers.intro")} />
          <ul className="mt-8 space-y-3">
            {EMPLOYER_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3 text-base text-foreground">
                <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal-strong">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {t(p)}
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap gap-3">
            <CtaLink href="/employers/request" cta="employer_request" location="home_employers" variant="primary" arrow className="min-h-12 px-6 text-[15px]">
              {t("employers.request")}
            </CtaLink>
            <a
              href={whatsappHref(t("employers.whatsappMessage"), whatsappE164)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <WhatsAppIcon className="size-5 text-green-strong" />
              {t("employers.whatsapp")}
              <span className="sr-only">{t("common.newTab")}</span>
            </a>
          </div>
          <Link href="/employers" className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-teal-strong underline-offset-4 hover:underline">
            {t("employers.howHiring")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-surface-subtle" data-reveal="2">
          <StockImage photo={stockPhoto("plant")} sizes="(min-width: 1024px) 45vw, 100vw" />
        </div>
      </div>
    </Section>
  );
}
