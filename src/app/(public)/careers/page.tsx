import { Award, Briefcase, CalendarDays, FileCheck2, GraduationCap, Mail, MapPin, Search, ThumbsUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CallButton, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { DateText } from "@/components/shared/date-text";
import { Button } from "@/components/ui/button";
import { humanize } from "@/lib/format";
import type { JobCard } from "@/modules/jobs/types";
import { getSetting } from "@/modules/settings";

import { listCompanyPublicJobs } from "../employers/[slug]/_lib/queries";

import { ArticleLayout, FactBox, Prose, TableOfContents } from "../news/_components/article-parts";
import { MetaItem, PreviewRibbon, PublicHero, PublicSection } from "../news/_components/public-hero";
import { entryMetadata, listingMetadata, loadEntry, readPreview, safeLoad, type PageSearchParams } from "../news/_lib/cms";
import { calendarDate, withHeadingAnchors } from "../news/_lib/text";

const SLUG = "careers";
const DESCRIPTION = "Work at Venkat Sai Global: open roles and student internships at our office in Autonagar, Gajuwaka, Visakhapatnam.";

/** Published jobs of Venkat Sai's own organisation (setting careers.organization_id, set by npm run db:seed:careers). */
async function loadOpenings(): Promise<JobCard[]> {
  const organizationId = await getSetting("careers.organization_id");
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return [];
  const list = await listCompanyPublicJobs(organizationId, 20);
  // Jobs first, internships after (each group keeps the newest-first order).
  return [...list.filter((j) => j.employmentType !== "internship"), ...list.filter((j) => j.employmentType === "internship")];
}

function placeOf(job: JobCard): string {
  return [job.location.city, job.location.stateRegion, job.location.countryName].filter(Boolean).join(", ") || "Visakhapatnam, India";
}

function OpeningCard({ job }: { job: JobCard }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-white p-5 sm:flex-row sm:items-center sm:justify-between" data-testid="careers-opening">
      <div className="min-w-0">
        <h3 className="font-heading text-base font-bold text-navy">
          <Link href={`/jobs/${job.slug}`} className="hover:underline">
            {job.title}
          </Link>
        </h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Briefcase aria-hidden="true" className="size-4 shrink-0" />
            {humanize(job.employmentType)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-4 shrink-0" />
            {placeOf(job)}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link href={`/jobs/${job.slug}`} className="text-sm font-semibold text-teal-strong hover:underline">
          Details<span className="sr-only">: {job.title}</span>
        </Link>
        <Button asChild>
          <Link href={`/talent/apply/${job.id}`}>
            Apply<span className="sr-only">: {job.title}</span>
          </Link>
        </Button>
      </div>
    </li>
  );
}


export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const detail = await safeLoad("careers.meta", () => loadEntry("pages", SLUG, readPreview(sp)), null);
  return detail ? entryMetadata(detail, { path: "/careers", type: "website", fallbackDescription: DESCRIPTION }) : listingMetadata("Careers at Venkat Sai", DESCRIPTION, "/careers");
}

export default async function CareersPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const [detail, openings] = await Promise.all([safeLoad("careers.page", () => loadEntry("pages", SLUG, readPreview(sp)), null), safeLoad("careers.openings", loadOpenings, [])]);
  const internship = openings.find((j) => j.employmentType === "internship");
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
          {openings.length ? (
            <ul className="grid gap-3" data-testid="careers-openings">
              {openings.map((job) => (
                <OpeningCard key={job.id} job={job} />
              ))}
            </ul>
          ) : (
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
          )}
        </PublicSection>
        {internship ? (
          <PublicSection title="Internships for students" id="internships">
            <div className="rounded-xl border border-border bg-teal-soft/40 p-6 sm:p-8" data-testid="careers-internships">
              <p className="text-sm text-foreground/80">Hands-on work in recruitment operations, documentation and coordination at our office. Duration is flexible.</p>
              <ul className="mt-4 grid gap-2 text-sm text-foreground sm:grid-cols-3">
                <li className="flex items-center gap-2">
                  <FileCheck2 aria-hidden="true" className="size-4 shrink-0 text-teal-strong" />
                  Offer letter at joining
                </li>
                <li className="flex items-center gap-2">
                  <Award aria-hidden="true" className="size-4 shrink-0 text-teal-strong" />
                  Internship certificate on completion
                </li>
                <li className="flex items-center gap-2">
                  <ThumbsUp aria-hidden="true" className="size-4 shrink-0 text-teal-strong" />
                  Letter of recommendation for good performance
                </li>
              </ul>
              <Link href={`/jobs/${internship.slug}`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-strong hover:underline">
                <GraduationCap aria-hidden="true" className="size-4" />
                See the internship and apply
              </Link>
            </div>
          </PublicSection>
        ) : null}
        <PublicSection title="Talk to our office" id="contact-office">
          <p className="text-sm text-muted-foreground">Questions about a role or the internship? Message or call our office.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <WhatsAppButton message="Hello, I would like to know about working at Venkat Sai." />
            <CallButton />
          </div>
        </PublicSection>
      </ArticleLayout>
    </>
  );
}
