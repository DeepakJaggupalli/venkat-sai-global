import { ArrowRight, Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { PublicMediaAsset } from "@/modules/content/types";

import { CmsIcon } from "./cms-icon";
import { CmsImage } from "./cms-media";
import { CtaLink, type CtaVariant } from "./cta-link";
import { Eyebrow } from "./section";
import { BeadPattern, HorizonOrnament } from "./visuals";

/**
 * Content blocks shared by the marketing pages (server components). Each renders nothing when it has no
 * items, so pages can pass CMS lists straight through and empty sections disappear.
 */

export type TitledItem = { title?: string | null; description?: string | null };

function clean<T extends TitledItem>(items: readonly T[] | null | undefined): T[] {
  return (items ?? []).filter((i) => Boolean(i?.title?.trim()));
}

/** Grid of titled items (who it helps, what we provide, values, capabilities). */
export function FeatureGrid({ items, columns = 3, className, icon }: { items: readonly TitledItem[] | null | undefined; columns?: 2 | 3 | 4; className?: string; icon?: ReactNode }) {
  const list = clean(items);
  if (!list.length) return null;
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", columns === 3 && "lg:grid-cols-3", columns === 4 && "lg:grid-cols-4", className)}>
      {list.map((item, i) => (
        <li key={`${item.title}-${i}`} className="relative rounded-xl border border-border bg-white p-6 shadow-xs">
          {icon ? <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-teal-soft text-teal-strong [&_svg]:size-5">{icon}</div> : null}
          <h3 className="font-heading text-lg font-semibold text-navy">{item.title}</h3>
          {item.description ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** Numbered process steps on a connecting line (vertical on phones, horizontal-ish grid on desktop). */
export function StepList({ steps, className, onDark = false }: { steps: readonly TitledItem[] | null | undefined; className?: string; onDark?: boolean }) {
  const list = clean(steps);
  if (!list.length) return null;
  return (
    <ol className={cn("relative grid gap-6 md:grid-cols-2 lg:grid-cols-4", className)}>
      {list.map((step, i) => (
        <li key={`${step.title}-${i}`} className="relative flex gap-4 md:flex-col">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full border-2 font-heading text-base font-bold",
              onDark ? "border-teal bg-navy text-white" : "border-teal bg-white text-navy",
            )}
          >
            {i + 1}
          </span>
          <div>
            <h3 className={cn("font-heading text-base font-semibold", onDark ? "text-white" : "text-navy")}>
              <span className="sr-only">Step {i + 1}: </span>
              {step.title}
            </h3>
            {step.description ? <p className={cn("mt-1.5 text-sm leading-relaxed", onDark ? "text-white/75" : "text-muted-foreground")}>{step.description}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Ticked list of short statements (benefits, requirements). */
export function CheckList({ items, className, columns = 1 }: { items: readonly (string | null | undefined)[] | null | undefined; className?: string; columns?: 1 | 2 }) {
  const list = (items ?? []).map((i) => i?.trim()).filter((i): i is string => Boolean(i));
  if (!list.length) return null;
  return (
    <ul className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2", className)}>
      {list.map((item, i) => (
        <li key={`${item}-${i}`} className="flex gap-3 text-base leading-relaxed text-foreground">
          <span aria-hidden="true" className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal-strong">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Accessible FAQ accordion built on <details>/<summary> (keyboard operable without JavaScript). */
export function FaqList({ faqs, className }: { faqs: readonly { question?: string | null; answer?: string | null }[] | null | undefined; className?: string }) {
  const list = (faqs ?? []).filter((f) => f?.question?.trim() && f?.answer?.trim());
  if (!list.length) return null;
  return (
    <div className={cn("divide-y divide-border overflow-hidden rounded-xl border border-border bg-white", className)}>
      {list.map((faq, i) => (
        <details key={`${faq.question}-${i}`} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-heading text-base font-semibold text-navy focus-visible:outline-2 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
            <span>{faq.question}</span>
            <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="whitespace-pre-line px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{faq.answer}</div>
        </details>
      ))}
    </div>
  );
}

export type CtaSpec = { label?: string | null; href?: string | null };

function validCta(cta: CtaSpec | null | undefined): cta is { label: string; href: string } {
  return Boolean(cta?.label?.trim() && cta?.href?.trim() && (cta.href.startsWith("/") ? !cta.href.startsWith("//") : /^https?:\/\//i.test(cta.href)));
}

/** Renders a CMS call to action only when both text and a safe link are present. */
export function CmsCta({ cta, id, location, variant = "primary", fallback }: { cta: CtaSpec | null | undefined; id: string; location: string; variant?: CtaVariant; fallback?: CtaSpec }) {
  const chosen = validCta(cta) ? cta : validCta(fallback) ? fallback : null;
  if (!chosen) return null;
  return (
    <CtaLink href={chosen.href} cta={id} location={location} variant={variant}>
      {chosen.label}
    </CtaLink>
  );
}

/** Closing call-to-action band: deep navy, heavy display headline, yellow primary action. */
export function CtaBand({
  heading,
  body,
  primary,
  secondary,
  location,
  eyebrow,
  headingId = "cta-band-title",
}: {
  heading: string;
  body?: string | null;
  primary: { label: string; href: string; id: string };
  secondary?: { label: string; href: string; id: string } | null;
  location: string;
  eyebrow?: string;
  headingId?: string;
}) {
  return (
    <section aria-labelledby={headingId} className="band-dark relative isolate overflow-hidden bg-navy-deep py-16 text-white sm:py-24">
      <BeadPattern />
      <div aria-hidden="true" className="absolute -top-32 -right-24 -z-10 size-[28rem] rounded-full bg-royal/50 blur-3xl" />
      <HorizonOrnament className="absolute -right-16 -bottom-24 -z-10 hidden w-[26rem] opacity-80 md:block" />
      <div className="container-page relative">
        <div className="max-w-3xl">
          {eyebrow ? <Eyebrow onDark>{eyebrow}</Eyebrow> : null}
          <h2 id={headingId} className="mt-4 text-balance font-display text-4xl uppercase sm:text-6xl">
            {heading}
          </h2>
          {body ? <p className="mt-4 text-pretty text-lg leading-relaxed text-white/80">{body}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink href={primary.href} cta={primary.id} location={location} variant="accent" arrow className="min-h-13 px-7 text-base">
              {primary.label}
            </CtaLink>
            {secondary ? (
              <CtaLink href={secondary.href} cta={secondary.id} location={location} variant="onDark" className="min-h-13 px-7 text-base">
                {secondary.label}
              </CtaLink>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Card linking to a CMS entry page (service, industry, destination). */
export function EntryCard({
  href,
  title,
  summary,
  iconName,
  image,
  badge,
  headingLevel: Heading = "h3",
  className,
  footer,
}: {
  href: string;
  title: string;
  summary?: string | null;
  iconName?: string | null;
  image?: PublicMediaAsset | null;
  badge?: ReactNode;
  headingLevel?: "h2" | "h3";
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <article className={cn("lift group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-xs", className)}>
      {image && image.kind === "image" ? (
        <div className="aspect-[16/9] overflow-hidden bg-surface-subtle">
          <CmsImage asset={image} size="md" sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="transition-transform duration-300 group-hover:scale-[1.02]" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          {!image ? (
            <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-lg bg-navy text-white">
              <CmsIcon name={iconName} className="size-5" />
            </span>
          ) : null}
          {badge}
        </div>
        <Heading className={cn("font-heading text-lg font-semibold text-navy", !image && "mt-4")}>
          <Link href={href} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2">
            {title}
          </Link>
        </Heading>
        {summary ? <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{summary}</p> : null}
        <div className="mt-auto pt-5">
          {footer ?? (
            <span aria-hidden="true" className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-strong">
              Learn more <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Two-column prose block: heading on the left, rich content on the right (desktop). */
export function ProseSplit({ id, eyebrow, title, children }: { id: string; eyebrow?: string; title: string; children: ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <div>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 id={id} className="mt-3 text-balance font-heading text-3xl font-bold tracking-tight text-navy">
          {title}
        </h2>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
