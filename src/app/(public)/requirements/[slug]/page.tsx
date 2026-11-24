import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CmsImage } from "@/components/public/cms-media";
import { Flag } from "@/components/public/flag";
import { JsonLd } from "@/components/public/json-ld";
import { Breadcrumbs } from "@/components/public/page-hero";
import { PreviewRibbon } from "@/components/public/preview-ribbon";
import { requirementApplyHref, requirementWhatsAppMessage } from "@/components/public/requirements/card-helpers";
import { CallButton, CONTACT_BUTTON_STYLES, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { loadPoster } from "@/components/public/requirements/data";
import { LatestRequirements } from "@/components/public/requirements/latest-requirements";
import { ShareToWhatsApp } from "@/components/public/requirements/share-to-whatsapp";
import { buildPageMetadata, previewTokenFrom } from "@/components/public/server";
import { DateText } from "@/components/shared/date-text";
import { CONTACT } from "@/config/contact";
import { absoluteUrl } from "@/lib/env";
import type { SearchParams } from "@/lib/http";
import { cn } from "@/lib/utils";
import { buildRequirementJobPosting } from "@/modules/recruitment-posters/job-posting";
import { posterShareDetails } from "@/modules/recruitment-posters/share";

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
  const whatsappMessage = requirementWhatsAppMessage({ title: card.title, countryName: card.countryName, url: absoluteUrl(card.href) });
  const applyHref = requirementApplyHref(card.slug);
  // Google job listing: not for previews; null once the poster's apply-by date (or 30 days) has passed.
  const jobPosting = poster.preview
    ? null
    : buildRequirementJobPosting(
        { ...card, imageUrl: card.poster ? (/^https?:\/\//.test(card.poster.url) ? card.poster.url : absoluteUrl(card.poster.url)) : null },
        { url: absoluteUrl(card.href), site: { name: CONTACT.businessName, url: absoluteUrl("/"), logo: absoluteUrl("/icon") } },
      );

  return (
    <>
      {jobPosting ? <JsonLd data={jobPosting} /> : null}
      <PreviewRibbon show={poster.preview} />
      <div className="container-page pt-10 pb-16 sm:pt-12 sm:pb-24">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Requirements", href: "/requirements" }, { label: card.title }]} className="mb-8" />
        {/* With a poster: poster left, details right. Without one: the details alone, in a comfortable reading width. */}
        <div className={cn("grid gap-10 lg:items-start lg:gap-14", card.poster ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "max-w-3xl")}>
          {card.poster ? (
            <div className="min-w-0 overflow-hidden rounded-3xl border border-border bg-surface-subtle p-3 shadow-card">
              <a href={card.poster.url} target="_blank" rel="noopener noreferrer" className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <CmsImage asset={{ ...card.poster, alt: card.alt }} size="lg" priority className="h-auto object-contain" sizes="(min-width: 1024px) 55vw, 100vw" />
                <span className="sr-only"> (open the full-size poster in a new tab)</span>
              </a>
            </div>
          ) : null}

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
              <p className="mt-2 text-sm text-muted-foreground">
                Posted <DateText value={card.publishedAt} />
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap" data-testid="requirement-actions">
              <Link href={applyHref} className={cn(CONTACT_BUTTON_STYLES.call, "group/apply")} data-testid="apply-send-cv">
                Apply: send your CV
                <ArrowRight aria-hidden="true" className="size-4! transition-transform duration-150 group-hover/apply:translate-x-0.5 motion-reduce:transition-none" />
              </Link>
              <WhatsAppButton message={whatsappMessage} label="Apply on WhatsApp" />
              <CallButton className={CONTACT_BUTTON_STYLES.outline} />
              <ShareToWhatsApp
                imageUrl={card.poster?.url ?? null}
                title={card.title}
                details={posterShareDetails(card.countryName, card.trades.map((t) => t.trade))}
                url={absoluteUrl(card.href)}
                label="Share"
                ariaLabel="Share this requirement with a friend"
              />
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
      <LatestRequirements heading="More requirements" limit={4} tone="subtle" excludeSlug={card.slug} />
    </>
  );
}
