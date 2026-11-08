import { ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { PublicMediaAsset } from "@/modules/content/types";

import { CmsIcon } from "./cms-icon";
import { CmsImage } from "./cms-media";
import { CtaLink, type CtaVariant } from "./cta-link";
import { Eyebrow } from "./section";

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
        <li key={`${item.title}-${i}`} className="card-surface relative rounded-2xl p-6 sm:p-7">
          {icon ? <div className="mb-5 flex size-10 items-center justify-center rounded-xl bg-teal-soft text-teal-strong [&_svg]:size-5">{icon}</div> : null}
          <h3 className="font-heading text-lg font-bold tracking-tight text-foreground">{item.title}</h3>
          {item.description ? <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{item.description}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** Numbered process steps: a hairline timeline (vertical on phones, a four-column row on desktop). */
export function StepList({ steps, className }: { steps: readonly TitledItem[] | null | undefined; className?: string; /** @deprecated no dark bands any more */ onDark?: boolean }) {
  const list = clean(steps);
  if (!list.length) return null;
  return (
    <ol className={cn("relative grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-4", className)}>
      {list.map((step, i) => (
        <li key={`${step.title}-${i}`} className="relative border-l border-border pl-6 md:border-t md:border-l-0 md:pt-6 md:pl-0">
          <span aria-hidden="true" className="absolute top-0 -left-[5px] size-2.5 rounded-full bg-teal md:-top-[5px] md:left-0" />
          <p aria-hidden="true" className="font-display text-sm text-teal-strong tabular-nums">
            {String(i + 1).padStart(2, "0")}
          </p>
          <h3 className="mt-2 font-heading text-lg font-bold tracking-tight text-foreground">
            <span className="sr-only">Step {i + 1}: </span>
            {step.title}
          </h3>
          {step.description ? <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{step.description}</p> : null}
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
            <Check className="size-3" strokeWidth={3} />
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
    <div className={cn("divide-y divide-border border-y border-border", className)}>
      {list.map((faq, i) => (
        <details key={`${faq.question}-${i}`} className="group">
          <FaqSummary>{faq.question}</FaqSummary>
          <div className="max-w-2xl pb-6 text-[15px] leading-relaxed whitespace-pre-line text-muted-foreground">{faq.answer}</div>
        </details>
      ))}
    </div>
  );
}

/** The clickable row of an FAQ item: question and a plus that turns into a cross when open. */
export function FaqSummary({ children }: { children: ReactNode }) {
  return (
    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-5 font-heading text-lg font-semibold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
      <span>{children}</span>
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-white text-foreground transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">
        <Plus className="size-4" />
      </span>
    </summary>
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

/** Closing statement: very large black type, one grey line and the two pills, centred on white. */
export function CtaBand({
  heading,
  body,
  primary,
  secondary,
  location,
  eyebrow,
  headingId = "cta-band-title",
  tone = "white",
}: {
  heading: string;
  body?: string | null;
  primary: { label: string; href: string; id: string };
  secondary?: { label: string; href: string; id: string } | null;
  location: string;
  eyebrow?: string;
  headingId?: string;
  tone?: "white" | "subtle";
}) {
  return (
    <section aria-labelledby={headingId} className={cn("py-20 sm:py-28 lg:py-36", tone === "subtle" ? "bg-surface-subtle" : "bg-white")} data-testid="cta-band">
      <div className="container-page flex flex-col items-center text-center" data-reveal>
        {eyebrow ? <Eyebrow className="justify-center">{eyebrow}</Eyebrow> : null}
        <h2 id={headingId} className="mt-5 max-w-4xl text-balance font-display text-[2.75rem] text-foreground sm:text-6xl lg:text-[5rem]">
          {heading}
        </h2>
        {body ? <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">{body}</p> : null}
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <CtaLink href={primary.href} cta={primary.id} location={location} variant="primary" arrow className="min-h-12 px-6 text-[15px]">
            {primary.label}
          </CtaLink>
          {secondary ? (
            <CtaLink href={secondary.href} cta={secondary.id} location={location} variant="outline" className="min-h-12 px-6 text-[15px]">
              {secondary.label}
            </CtaLink>
          ) : null}
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
    <article className={cn("card-surface lift group relative flex h-full flex-col overflow-hidden rounded-2xl", className)}>
      {image && image.kind === "image" ? (
        <div className="aspect-[16/10] overflow-hidden bg-surface-subtle">
          <CmsImage asset={image} size="md" sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          {!image ? (
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-teal-soft text-teal-strong">
              <CmsIcon name={iconName} className="size-5" />
            </span>
          ) : null}
          {badge}
        </div>
        <Heading className={cn("font-heading text-lg font-bold tracking-tight text-foreground", !image && "mt-5")}>
          <Link href={href} className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2">
            {title}
          </Link>
        </Heading>
        {summary ? <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{summary}</p> : null}
        <div className="mt-auto pt-5">
          {footer ?? (
            <span aria-hidden="true" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
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
        <h2 id={id} className="mt-4 text-balance font-display text-[2rem] text-foreground sm:text-[2.5rem]">
          {title}
        </h2>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
