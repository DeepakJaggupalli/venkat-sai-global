import { ArrowRight, CalendarClock, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CmsImage } from "@/components/public/cms-media";
import { Flag } from "@/components/public/flag";
import { Breadcrumbs } from "@/components/public/page-hero";
import { PreviewRibbon } from "@/components/public/preview-ribbon";
import { CallButton, CONTACT_BUTTON_STYLES, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { loadPoster } from "@/components/public/requirements/data";
import { LatestRequirements } from "@/components/public/requirements/latest-requirements";
import { buildPageMetadata, previewTokenFrom } from "@/components/public/server";
import { DateText } from "@/components/shared/date-text";
import type { SearchParams } from "@/lib/http";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

function describe(card: { title: string; countryName: string | null; trades: { trade: string }[]; description: string | null; summary: string | null }): string {
  if (card.summary) return card.summary;
  if (card.description) return card.description.slice(0, 190);
  const trades = card.trades.map((t) => t.trade).join(", ");
  return `${card.title}${card.countryName ? ` in ${card.countryName}` : ""}${trades ? `: ${trades}` : ""}. Send your CV or contact Venkat Sai Global on WhatsApp.`;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const poster = await loadPoster(slug, previewTokenFrom(sp));
  if (!poster) return { title: "Requirement not found", robots: { index: false, follow: false } };
  return buildPageMetadata({
    title: poster.card.countryName ? `${poster.card.title} - ${poster.card.countryName}` : poster.card.title,
    description: describe(poster.card),
    path: poster.card.href,
    seo: poster.seo,
    assets: poster.assets,
    imageAssetId: poster.card.poster?.id ?? null,
    noindex: poster.preview,
  });
}

export default async function RequirementPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const poster = await loadPoster(slug, previewTokenFrom(sp));
  if (!poster) notFound();
  const { card } = poster;
  const where = card.countryName ? ` (${card.countryName})` : "";
  const whatsappMessage = `Hello Venkat Sai, I am interested in the requirement "${card.title}"${where}. Please call me.`;
  const applyHref = `/send-cv?requirement=${encodeURIComponent(card.slug)}`;

  return (
    <>
      <PreviewRibbon show={poster.preview} />
      <div className="container-page pt-10 pb-16 sm:pt-12 sm:pb-24">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Requirements", href: "/requirements" }, { label: card.title }]} className="mb-8" />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-14">
          <div className="min-w-0 overflow-hidden rounded-3xl border border-border bg-surface-subtle p-3 shadow-card">
            {card.poster ? (
              <a href={card.poster.url} target="_blank" rel="noopener noreferrer" className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <CmsImage asset={{ ...card.poster, alt: card.alt }} size="lg" priority className="h-auto object-contain" sizes="(min-width: 1024px) 55vw, 100vw" />
                <span className="sr-only"> (open the full-size poster in a new tab)</span>
              </a>
            ) : (
              <p className="p-8 text-sm text-muted-foreground">The poster image is not available.</p>
            )}
          </div>

          <div className="min-w-0 space-y-6">
            <div>
              {card.countryName ? (
                <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Flag code={card.countryCode} />
                  {card.countryName}
                </p>
              ) : null}
              <h1 className="mt-4 text-balance font-display text-[2.25rem] text-foreground sm:text-5xl">{card.title}</h1>
              {card.companyName ? <p className="mt-2 text-base text-foreground">Company: {card.companyName}</p> : null}
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Posted <DateText value={card.publishedAt} />
                </span>
                {card.applyBy ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-4" aria-hidden="true" />
                    Apply by <DateText value={card.applyBy} dateOnly />
                  </span>
                ) : null}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap" data-testid="requirement-actions">
              <Link href={applyHref} className={cn(CONTACT_BUTTON_STYLES.call, "group/apply")} data-testid="apply-send-cv">
                Apply: send your CV
                <ArrowRight aria-hidden="true" className="size-4! transition-transform duration-150 group-hover/apply:translate-x-0.5 motion-reduce:transition-none" />
              </Link>
              <WhatsAppButton message={whatsappMessage} />
              <CallButton className={CONTACT_BUTTON_STYLES.outline} />
            </div>

            {card.trades.length ? (
              <section aria-labelledby="trades-heading">
                <h2 id="trades-heading" className="font-heading text-lg font-bold tracking-tight text-foreground">
                  Trades and salary
                </h2>
                <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-white">
                  {card.trades.map((t, i) => (
                    <li key={`${t.trade}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                      <span className="font-medium text-foreground">{t.trade}</span>
                      {t.pay ? <span className="text-sm text-muted-foreground">{t.pay}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {card.benefits.length ? (
              <section aria-labelledby="benefits-heading">
                <h2 id="benefits-heading" className="font-heading text-lg font-bold tracking-tight text-foreground">
                  Benefits
                </h2>
                <ul className="mt-3 space-y-2">
                  {card.benefits.map((b, i) => (
                    <li key={`${b}-${i}`} className="flex items-start gap-2 text-foreground">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-strong" aria-hidden="true" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {card.description ? (
              <section aria-labelledby="details-heading">
                <h2 id="details-heading" className="font-heading text-lg font-bold tracking-tight text-foreground">
                  Details
                </h2>
                <p className="mt-2 whitespace-pre-line leading-relaxed text-foreground">{card.description}</p>
              </section>
            ) : null}

            <p className="rounded-2xl border border-border bg-surface-subtle p-4 text-sm leading-relaxed text-foreground">
              Venkat Sai never charges candidates to apply for a job, and no payment can guarantee a job or visa.{" "}
              <Link href="/safe-recruitment" className="font-medium text-teal-strong underline underline-offset-4">
                How to stay safe
              </Link>
            </p>
          </div>
        </div>
      </div>
      <LatestRequirements heading="More requirements" limit={4} className="bg-surface-subtle" />
    </>
  );
}
