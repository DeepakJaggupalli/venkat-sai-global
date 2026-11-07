import { CalendarDays, Cookie, FileText, History, Scale, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

import { GrievanceOfficerCard } from "../../grievance/_components/officer-card";
import { GuestDataRequestForm } from "./_components/guest-data-request";
import { ArticleLayout, FactBox, Prose, TableOfContents } from "../../news/_components/article-parts";
import { JsonLd } from "../../news/_components/json-ld";
import { MetaItem, PreviewRibbon, PublicHero } from "../../news/_components/public-hero";
import { abs, breadcrumbJsonLd, entryMetadata, loadEntry, loadPrivacyTimelines, loadSiteSettings, readPreview, safeLoad, type PageSearchParams } from "../../news/_lib/cms";
import { calendarDate, withHeadingAnchors } from "../../news/_lib/text";

/** Fixed legal routes (docs/CONVENTIONS.md §7). The CMS `pages` entry with the same slug supplies the text. */
const LEGAL_PAGES = {
  "privacy-policy": { title: "Privacy policy", description: "How Venkat Sai Global collects, uses, shares and protects personal data." },
  terms: { title: "Terms of use", description: "The terms that apply when you use Venkat Sai Global." },
  "cookie-policy": { title: "Cookie policy", description: "The cookies and similar technologies Venkat Sai Global uses, and your choices." },
  "data-rights": { title: "Your data rights", description: "How to access, correct, erase or port your personal data, and how long we take to respond." },
  accessibility: { title: "Accessibility statement", description: "Our commitment to an accessible website and how to report a barrier." },
  disclaimers: { title: "Disclaimers", description: "Important limits on the information and services provided through Venkat Sai Global." },
} as const;

type LegalSlug = keyof typeof LEGAL_PAGES;
type Props = { params: Promise<{ slug: string }>; searchParams: PageSearchParams };

function isLegalSlug(slug: string): slug is LegalSlug {
  return Object.hasOwn(LEGAL_PAGES, slug);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  if (!isLegalSlug(slug)) return { title: "Page not found", robots: { index: false } };
  const detail = await safeLoad("legal.meta", () => loadEntry("pages", slug, readPreview(sp)), null);
  if (!detail) return { title: LEGAL_PAGES[slug].title, description: LEGAL_PAGES[slug].description, robots: { index: false } };
  return entryMetadata(detail, { path: `/legal/${slug}`, type: "website", fallbackDescription: LEGAL_PAGES[slug].description });
}

export default async function LegalPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  if (!isLegalSlug(slug)) notFound();
  const fallback = LEGAL_PAGES[slug];
  const [detail, timelines, settings] = await Promise.all([
    safeLoad("legal.page", () => loadEntry("pages", slug, readPreview(sp)), null),
    slug === "data-rights" ? loadPrivacyTimelines() : Promise.resolve(null),
    slug === "data-rights" ? loadSiteSettings() : Promise.resolve(null),
  ]);
  const page = detail?.entry;
  const body = withHeadingAnchors(page?.data.body);
  const effective = calendarDate(page?.data.effectiveDate);
  const showToc = page?.data.showTableOfContents !== false;
  const title = page?.title ?? fallback.title;
  const slaDays = timelines && Number.isFinite(timelines.dataRequestDays) && timelines.dataRequestDays > 0 ? timelines.dataRequestDays : null;

  return (
    <>
      <PreviewRibbon preview={Boolean(detail?.preview)} />
      {page && !detail?.preview ? (
        <JsonLd data={breadcrumbJsonLd([{ name: "Home", url: abs("/") }, { name: "Legal" }, { name: title, url: abs(`/legal/${slug}`) }])} />
      ) : null}
      <PublicHero
        eyebrow="Legal"
        title={title}
        description={page?.summary ?? fallback.description}
        breadcrumbs={[{ label: "Legal" }, { label: title }]}
        meta={
          page ? (
            <>
              {effective ? (
                <MetaItem icon={<CalendarDays />}>
                  Effective from <DateText value={effective} dateOnly />
                </MetaItem>
              ) : null}
              {page.data.version ? <MetaItem icon={<FileText />}>Version {page.data.version}</MetaItem> : null}
            </>
          ) : undefined
        }
        actions={
          slug === "cookie-policy" ? (
            <Button asChild variant="outline">
              <Link href="/cookie-preferences">
                <Cookie aria-hidden="true" />
                Change cookie preferences
              </Link>
            </Button>
          ) : undefined
        }
      />
      {page ? (
        <ArticleLayout
          aside={
            <>
              {showToc ? <TableOfContents headings={body.headings} title="Contents" /> : null}
              {slug === "data-rights" ? (
                <>
                  <FactBox title="Response time">
                    <p className="flex items-start gap-2">
                      <Timer className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden="true" />
                      <span data-testid="data-request-sla">
                        {slaDays
                          ? `We respond to data requests within ${slaDays} ${slaDays === 1 ? "day" : "days"}.`
                          : "We respond to data requests within the period required by law."}
                      </span>
                    </p>
                    <p className="mt-3 text-muted-foreground">
                      Signed-in users can make most requests from{" "}
                      <Link href="/account/privacy" className="font-medium text-teal-strong hover:underline">
                        Privacy settings
                      </Link>
                      .
                    </p>
                  </FactBox>
                  <GrievanceOfficerCard officer={settings?.grievanceOfficer} />
                </>
              ) : null}
              <FactBox title="Questions">
                <p className="text-muted-foreground">
                  Contact us through the{" "}
                  <Link href="/grievance" className="font-medium text-teal-strong hover:underline">
                    grievance page
                  </Link>{" "}
                  or our{" "}
                  <Link href="/contact" className="font-medium text-teal-strong hover:underline">
                    contact form
                  </Link>
                  .
                </p>
              </FactBox>
            </>
          }
        >
          {page.data.summaryOfChanges ? (
            <div className="mb-8 rounded-xl border border-border/80 bg-surface-subtle p-5 text-sm">
              <p className="flex items-center gap-2 font-semibold text-navy">
                <History className="size-4" aria-hidden="true" />
                What changed in this version
              </p>
              <p className="mt-2 whitespace-pre-line text-muted-foreground">{page.data.summaryOfChanges}</p>
            </div>
          ) : null}
          <Prose html={body.html} />
          {slug === "data-rights" && !detail?.preview ? (
            <section id="request" aria-labelledby="guest-request-heading" className="mt-12 rounded-xl border border-border/80 bg-surface-subtle p-5 sm:p-6">
              <h2 id="guest-request-heading" className="font-heading text-xl font-semibold text-navy">
                Make a request without an account
              </h2>
              <p className="mt-2 mb-5 text-sm text-muted-foreground">Use this form if you do not have an account or cannot sign in.</p>
              <GuestDataRequestForm />
            </section>
          ) : null}
        </ArticleLayout>
      ) : (
        <div className="container-page py-14">
          <EmptyState
            icon={<Scale />}
            titleAs="h2"
            title="This page is being updated"
            description="The current version of this document is not available right now. Please contact us if you need it and we will send it to you."
            primaryAction={{ label: "Contact us", href: "/contact" }}
            secondaryAction={{ label: "Grievance redressal", href: "/grievance", variant: "outline" }}
          />
        </div>
      )}
    </>
  );
}
