import { Building2, ClipboardCheck, FileText, Flame, PhoneCall, PlaneTakeoff, Stamp, Users, Wrench, Zap } from "lucide-react";

import { whatsappHref } from "@/config/contact";

import { WhatsAppIcon } from "../contact-links";
import { CtaLink } from "../cta-link";
import { Section, SectionHeading } from "../section";

type Text = { heading?: string | null; intro?: string | null };

const STEPS = [
  { title: "Send your CV and trade", body: "Online, on WhatsApp or at our Autonagar office. Tell us your trade and experience.", icon: FileText },
  { title: "We call you", body: "Our team talks you through the openings that match your trade and experience.", icon: PhoneCall },
  { title: "Trade test or training", body: "Show your skill in a trade test, or train with us first to reach the level employers ask for.", icon: ClipboardCheck },
  { title: "Visa, ticket, documents", body: "We guide you through medicals, visa, PDOT (Pre-Departure Orientation Training) and travel papers.", icon: Stamp },
  { title: "Fly to work", body: "You travel to your new job with your contract and contacts in hand.", icon: PlaneTakeoff },
] as const;

/** Five-step candidate journey on navy, with numbered display figures and a connecting line. */
export function HowItWorksSection({ heading, intro }: Text) {
  return (
    <Section tone="navy" labelledBy="home-how-title" data-testid="home-how-it-works" className="overflow-hidden">
      <div aria-hidden="true" className="bg-grid-dark absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
      <div className="relative" data-reveal>
        <SectionHeading
          id="home-how-title"
          onDark
          eyebrow="For candidates"
          title={<span className="uppercase">{heading || "From your CV to your flight"}</span>}
          intro={intro || "A clear path with one team beside you. You never pay to apply for a job."}
          action={
            <CtaLink href="/send-cv" cta="how_send_cv" location="home_how_it_works" variant="accent" arrow>
              Send your CV
            </CtaLink>
          }
        />
      </div>
      <ol className="relative mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
        <span aria-hidden="true" className="absolute top-7 right-[10%] left-[10%] hidden h-0.5 bg-gradient-to-r from-yellow via-white/30 to-yellow lg:block" />
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="relative" data-reveal={String(Math.min(i + 1, 4))}>
              <span aria-hidden="true" className="relative flex size-14 items-center justify-center rounded-2xl bg-yellow text-navy shadow-[0_0_0_6px_rgb(6_18_58)] [&_svg]:size-6">
                <Icon />
              </span>
              <p aria-hidden="true" className="mt-5 font-display text-5xl text-white/15">
                0{i + 1}
              </p>
              <h3 className="-mt-6 font-display text-2xl uppercase text-white">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{step.body}</p>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

const COURSES = [
  { title: "Welding 3G / 4G", body: "Plate and positional welding for structural work.", icon: Flame },
  { title: "Welding 5G / 6G", body: "Pipe welding in the positions overseas trade tests ask for.", icon: Flame },
  { title: "Electrical", body: "Industrial wiring, panels and safe working practice.", icon: Zap },
  { title: "Fitter and piping", body: "Pipe and structural fitting, drawings and alignment.", icon: Wrench },
] as const;

/** Training teaser: four course tiles and links to the training catalogue and the training service. */
export function TrainingTeaser({ heading, intro }: Text) {
  return (
    <Section tone="subtle" labelledBy="home-training-title" data-testid="home-training">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div data-reveal>
          <SectionHeading
            id="home-training-title"
            eyebrow="Train with us"
            title={<span className="uppercase">{heading || "Learn the trade in a real workshop"}</span>}
            intro={intro || "Practical training at the Venkat Sai Welding Works and Testing Center in Autonagar, Gajuwaka. Results are recorded as Venkat Sai assessments."}
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink href="/training" cta="training_courses" location="home_training" variant="primary" arrow>
              See training courses
            </CtaLink>
            <CtaLink href="/services/technical-training" cta="training_service" location="home_training" variant="outline">
              About our training
            </CtaLink>
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {COURSES.map((c, i) => {
            const Icon = c.icon;
            return (
              <li key={c.title} data-reveal={String(i + 1)} className="lift relative overflow-hidden rounded-2xl border border-border bg-white p-6">
                <span aria-hidden="true" className="absolute -top-6 -right-6 size-24 rounded-full bg-yellow/30" />
                <span aria-hidden="true" className="relative flex size-12 items-center justify-center rounded-xl bg-navy text-yellow [&_svg]:size-6">
                  <Icon />
                </span>
                <h3 className="relative mt-4 font-display text-2xl uppercase text-navy">{c.title}</h3>
                <p className="relative mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

/** Employer band: tell us the trades and numbers you need. */
export function EmployerBand({ heading, intro, whatsappE164 }: Text & { whatsappE164?: string }) {
  return (
    <section aria-labelledby="home-employers-title" className="band-dark relative isolate overflow-hidden bg-royal py-16 text-white sm:py-20" data-testid="home-employers">
      <div aria-hidden="true" className="absolute inset-y-0 right-0 -z-10 hidden w-1/2 bg-[repeating-linear-gradient(-45deg,rgb(255_255_255/0.06)_0_2px,transparent_2px_18px)] lg:block" />
      <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-center">
        <div data-reveal>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-yellow">
            <Building2 aria-hidden="true" className="size-4" />
            For employers
          </p>
          <h2 id="home-employers-title" className="mt-3 text-balance font-display text-4xl uppercase sm:text-6xl">
            {heading || "Need welders, fitters or a full crew?"}
          </h2>
          <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-white/85">
            {intro || "Tell us the trades, numbers, location and start date. We shortlist trade-tested candidates and handle the paperwork with you."}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col" data-reveal="2">
          <CtaLink href="/employers/request" cta="employer_request" location="home_employers" variant="accent" arrow className="min-h-14 text-base">
            Tell us the trades you need
          </CtaLink>
          <CtaLink
            href={whatsappHref("Hello Venkat Sai, we need workers for a project.", whatsappE164)}
            cta="employer_whatsapp"
            location="home_employers"
            variant="onDark"
            className="min-h-14 text-base"
          >
            <WhatsAppIcon className="size-5" />
            WhatsApp our team
          </CtaLink>
          <p className="flex items-center gap-2 text-sm text-white/80">
            <Users aria-hidden="true" className="size-4 text-yellow" />
            Single trades or full project crews
          </p>
        </div>
      </div>
    </section>
  );
}
