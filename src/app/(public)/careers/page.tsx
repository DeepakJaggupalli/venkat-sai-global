import { Briefcase, CalendarDays, Mail, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DateText } from "@/components/shared/date-text";
import { Button } from "@/components/ui/button";

import { ArticleLayout, FactBox, Prose, TableOfContents } from "../news/_components/article-parts";
import { MetaItem, PreviewRibbon, PublicHero, PublicSection } from "../news/_components/public-hero";
import { entryMetadata, listingMetadata, loadEntry, readPreview, safeLoad, type PageSearchParams } from "../news/_lib/cms";
import { calendarDate, withHeadingAnchors } from "../news/_lib/text";

const SLUG = "careers";
const DESCRIPTION = "Work at Venkat Sai Global: how to express interest in joining our team in Visakhapatnam.";

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const detail = await safeLoad("careers.meta", () => loadEntry("pages", SLUG, readPreview(sp)), null);
  return detail ? entryMetadata(detail, { path: "/careers", type: "website", fallbackDescription: DESCRIPTION }) : listingMetadata("Careers at Venkat Sai", DESCRIPTION, "/careers");
}

export default async function CareersPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const detail = await safeLoad("careers.page", () => loadEntry("pages", SLUG, readPreview(sp)), null);
  const page = detail?.entry;
  const body = withHeadingAnchors(page?.data.body);
  const updated = calendarDate(page?.data.effectiveDate);

  return (
    <>
      <PreviewRibbon preview={Boolean(detail?.preview)} />
      <PublicHero
        eyebrow="Careers at Venkat Sai"
        title={page?.title ?? "Work with us"}
        description={page?.summary ?? "We are building a trusted platform for opportunity. If you would like to be part of the team, we would like to hear from you."}
        breadcrumbs={[{ label: "Careers" }]}
        meta={
          updated ? (
            <MetaItem icon={<CalendarDays />}>
              Updated <DateText value={updated} dateOnly />
            </MetaItem>
          ) : undefined
        }
        actions={
          <Button asChild size="lg">
            <Link href="/contact?type=careers">
              <Mail aria-hidden="true" />
              Express your interest
            </Link>
          </Button>
        }
      />
      <ArticleLayout
        aside={
          <>
            <TableOfContents headings={body.headings} />
            <FactBox title="Looking for a job with an employer?">
              <p className="text-muted-foreground">This page is about working for Venkat Sai Global itself. Jobs with our employer clients are listed on the job board.</p>
              <Link href="/jobs" className="mt-3 inline-flex items-center gap-1.5 font-semibold text-teal-strong hover:underline">
                <Search className="size-4" aria-hidden="true" />
                Browse jobs
              </Link>
            </FactBox>
          </>
        }
      >
        {page?.data.body ? <Prose html={body.html} /> : null}
        <PublicSection title="Current openings at Venkat Sai" id="openings" className={page?.data.body ? undefined : "pt-0"}>
          <div className="rounded-xl border border-dashed border-border bg-surface-subtle p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <Briefcase className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden="true" />
              <div>
                <p className="font-semibold text-navy">No openings are advertised right now</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You are welcome to send us your interest at any time through the contact form, choosing &ldquo;Careers at Venkat Sai&rdquo;. Tell us about
                  your skills and the kind of role you are looking for. We never charge anyone to apply.
                </p>
                <Link href="/contact?type=careers" className="mt-3 inline-block text-sm font-semibold text-teal-strong hover:underline">
                  Send a careers enquiry
                </Link>
              </div>
            </div>
          </div>
        </PublicSection>
      </ArticleLayout>
    </>
  );
}
