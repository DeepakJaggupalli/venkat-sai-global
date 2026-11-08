import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { whatsappHref } from "@/config/contact";
import { IMAGE_CREDITS, type ImageCredit } from "@/content/image-credits";
import { stockPhoto } from "@/content/stock-photos";

import { WhatsAppIcon } from "../contact-links";
import { CtaLink } from "../cta-link";
import { Section, SectionHeading, type SectionTone } from "../section";
import { StockImage } from "../stock-image";

type Text = { heading?: string | null; intro?: string | null };

function photoBySrc(name: string): ImageCredit {
  return IMAGE_CREDITS.find((c) => c.src === `/images/stock/${name}.webp`) ?? stockPhoto("workshop");
}

const STEPS = [
  { title: "Send your CV and trade", body: "Online, on WhatsApp or at our Autonagar office. Tell us your trade and experience." },
  { title: "We call you", body: "Our team talks you through the openings that match your trade and experience." },
  { title: "Trade test or training", body: "Show your skill in a trade test, or train with us first to reach the level employers ask for." },
  { title: "Visa, ticket, documents", body: "We guide you through medicals, visa, pre-departure orientation and travel papers." },
  { title: "Fly to work", body: "You travel to your new job with your contract and contacts in hand." },
] as const;

/** Candidate journey: heading, CTA and a photograph on the left, five numbered steps on a hairline on the right. */
export function HowItWorksSection({ tone = "white", heading, intro }: Text & { tone?: SectionTone }) {
  return (
    <Section tone={tone} labelledBy="home-how-title" data-testid="home-how-it-works">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start" data-reveal>
          <SectionHeading
            id="home-how-title"
            eyebrow="For candidates"
            title={heading || "From your CV to your flight"}
            intro={intro || "A clear path with one team beside you. You never pay to apply for a job."}
          />
          <div className="mt-8">
            <CtaLink href="/send-cv" cta="how_send_cv" location="home_how_it_works" variant="primary" arrow className="min-h-12 px-6 text-[15px]">
              Send your CV
            </CtaLink>
          </div>
          <div className="relative mt-10 hidden aspect-[16/10] overflow-hidden rounded-3xl border border-border bg-surface-subtle lg:block">
            <StockImage photo={stockPhoto("departure")} sizes="(min-width: 1024px) 40vw, 100vw" />
          </div>
        </div>
        <ol className="relative">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative grid grid-cols-[3rem_minmax(0,1fr)] gap-x-5 pb-10 last:pb-0" data-reveal={String(Math.min(i + 1, 4))}>
              {i < STEPS.length - 1 ? <span aria-hidden="true" className="absolute top-12 bottom-0 left-6 w-px bg-border" /> : null}
              <span aria-hidden="true" className="relative flex size-12 items-center justify-center rounded-full border border-border bg-white font-display text-base text-foreground tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="pt-2.5">
                <h3 className="font-heading text-xl font-bold tracking-tight text-foreground">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">{step.body}</p>
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
  { title: "Welding 3G / 4G", body: "Plate and positional welding for structural work.", href: "/services/welding-training", photo: "welding-1" },
  { title: "Welding 5G / 6G", body: "Pipe welding in the positions overseas tests ask for.", href: "/services/welding-training", photo: "welding-3" },
  { title: "Pipe fitting", body: "Pipe fit-up, alignment and reading isometrics.", href: "/services/pipe-fitting-training", photo: "pipe-1" },
  { title: "Electrical", body: "Industrial wiring, panels and safe isolation.", href: "/services/electrical-training", photo: "electrical-1" },
  { title: "Rigging", body: "Slinging, signalling and safe lifting.", href: "/services/rigging-training", photo: "rigging-2" },
  { title: "Scaffolding", body: "Erecting and inspecting tube and system scaffolds.", href: "/services/scaffolding-training", photo: "scaffolding-2" },
  { title: "NDT awareness", body: "How welds are inspected and tested.", href: "/services/ndt-awareness-training", photo: "inspection-1" },
  { title: "HSE and safety", body: "Site safety, PPE and permits to work.", href: "/services/hse-safety-training", photo: "safety-1" },
] as const;

export function TrainingTeaser({ tone = "subtle", heading, intro }: Text & { tone?: SectionTone }) {
  return (
    <Section tone={tone} labelledBy="home-training-title" data-testid="home-training">
      <div data-reveal>
        <SectionHeading
          id="home-training-title"
          eyebrow="Train with us"
          title={heading || "Learn the trade in a real workshop"}
          intro={intro || "Practical training at the Venkat Sai Welding Works and Testing Center in Autonagar, Gajuwaka. Results are recorded as Venkat Sai assessments."}
          action={
            <CtaLink href="/training" cta="training_courses" location="home_training" variant="outline" arrow>
              Training courses
            </CtaLink>
          }
        />
      </div>
      <ul className="mt-14 grid grid-cols-1 gap-x-6 gap-y-10 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {TRADE_TILES.map((t, i) => (
          <li key={t.title} data-reveal={String((i % 4) + 1)}>
            <article className="group relative">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-white">
                <StockImage
                  photo={photoBySrc(t.photo)}
                  decorative
                  sizes="(min-width: 1024px) 25vw, (min-width: 480px) 50vw, 100vw"
                  className="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
                />
              </div>
              <h3 className="mt-4 font-heading text-lg font-bold tracking-tight text-foreground">
                <Link href={t.href} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2">
                  {t.title}
                </Link>
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
            </article>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const EMPLOYER_POINTS = ["Trade-tested before you interview", "Single trades or full project crews", "Paperwork handled with you"] as const;

/** Employer band: two columns, copy and actions on the left, a photograph on the right. */
export function EmployerBand({ tone = "white", heading, intro, whatsappE164 }: Text & { whatsappE164?: string } & { tone?: SectionTone }) {
  return (
    <Section tone={tone} labelledBy="home-employers-title" data-testid="home-employers">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div data-reveal>
          <SectionHeading
            id="home-employers-title"
            eyebrow="For employers"
            title={heading || "Need welders, fitters or a full crew?"}
            intro={intro || "Tell us the trades, numbers, location and start date. We shortlist trade-tested candidates and handle the paperwork with you."}
          />
          <ul className="mt-8 space-y-3">
            {EMPLOYER_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3 text-base text-foreground">
                <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal-strong">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap gap-3">
            <CtaLink href="/employers/request" cta="employer_request" location="home_employers" variant="primary" arrow className="min-h-12 px-6 text-[15px]">
              Request workers
            </CtaLink>
            <a
              href={whatsappHref("Hello Venkat Sai, we need workers for a project.", whatsappE164)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <WhatsAppIcon className="size-5 text-green-strong" />
              WhatsApp our team
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
          <Link href="/employers" className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-teal-strong underline-offset-4 hover:underline">
            How hiring works
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
