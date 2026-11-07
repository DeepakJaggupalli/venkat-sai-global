import { Award, BookOpen, CalendarDays, Clock, Globe, GraduationCap, Landmark, MapPin, School } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { OrgAvatar } from "@/components/shared/avatars";
import { PageBreadcrumbs } from "@/components/shared/page-header";
import { SafeHtml } from "@/components/shared/safe-html";
import { VerificationBadge } from "@/components/shared/verification-badge";
import { BRAND } from "@/config/site";
import { INSTITUTION_KIND_LABELS } from "@/modules/organizations/constants";
import { getPublicInstitution } from "@/modules/organizations/institution";
import { COURSE_CATEGORY_LABELS, COURSE_CERTIFICATION_TYPE_LABELS, COURSE_MODE_LABELS } from "@/modules/training/constants";
import { listPublicCourses, type CatalogueCourse } from "@/modules/training/queries";

import { countryName } from "../../events/_lib/schedule";
import { JsonLd } from "../../news/_components/json-ld";
import { MetaItem, PublicSection } from "../../news/_components/public-hero";
import { abs, breadcrumbJsonLd, safeLoad, siteTimeZone } from "../../news/_lib/cms";
import { calendarDate, excerptText } from "../../news/_lib/text";

type Props = { params: Promise<{ slug: string }> };

const loadInstitution = cache((slug: string) => (/^[a-z0-9][a-z0-9-]{0,119}$/i.test(slug) ? getPublicInstitution(slug) : Promise.resolve(null)));

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function duration(course: CatalogueCourse): string | null {
  if (course.durationWeeks) return `${course.durationWeeks} ${course.durationWeeks === 1 ? "week" : "weeks"}`;
  if (course.durationHours) return `${course.durationHours} ${course.durationHours === 1 ? "hour" : "hours"}`;
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const inst = await loadInstitution(slug);
  if (!inst) return { title: "Institution not found", robots: { index: false } };
  const description = excerptText(inst.aboutHtml ?? inst.description, 160) || `${inst.name}: training courses on ${BRAND.name}.`;
  return {
    title: `${inst.name} · Training institution`,
    description,
    alternates: { canonical: `/institutions/${inst.slug}` },
    openGraph: { type: "website", title: inst.name, description, url: `/institutions/${inst.slug}`, ...(inst.logo ? { images: [{ url: inst.logo.url, alt: "" }] } : {}) },
  };
}

export default async function InstitutionProfilePage({ params }: Props) {
  const { slug } = await params;
  const inst = await loadInstitution(slug);
  if (!inst) notFound();
  const tz = siteTimeZone();
  const courses = await safeLoad("institution.courses", () => listPublicCourses({ institution: inst.slug }, { page: 1, pageSize: 24, offset: 0 }), null);
  const website = safeHttpUrl(inst.websiteUrl);
  const place = [inst.city, countryName(inst.countryCode)].filter(Boolean).join(", ");
  const kind = inst.institutionKind ? (INSTITUTION_KIND_LABELS[inst.institutionKind] ?? null) : null;
  const authorisedUntil = calendarDate(inst.authorisedCertificateIssuer?.until);

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "EducationalOrganization",
            name: inst.name,
            url: abs(`/institutions/${inst.slug}`),
            ...(website ? { sameAs: [website] } : {}),
            ...(inst.logo ? { logo: inst.logo.url } : {}),
            ...(place ? { address: { "@type": "PostalAddress", addressLocality: inst.city ?? undefined, addressCountry: inst.countryCode ?? undefined } } : {}),
            ...(inst.establishedYear ? { foundingDate: String(inst.establishedYear) } : {}),
          },
          breadcrumbJsonLd([{ name: "Home", url: abs("/") }, { name: "Institutions", url: abs("/institutions") }, { name: inst.name }]),
        ]}
      />
      <section className="border-b border-border/70 bg-surface-subtle">
        {inst.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={inst.cover.url} alt="" className="h-36 w-full object-cover sm:h-52" />
        ) : null}
        <div className="container-page py-8 sm:py-10">
          <PageBreadcrumbs items={[{ label: "Home", href: "/" }, { label: "Institutions", href: "/institutions" }, { label: inst.name }]} className="mb-6" />
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <OrgAvatar name={inst.name} src={inst.logo?.thumbnailUrl ?? inst.logo?.url ?? null} size="xl" verified={Boolean(inst.verifiedAt)} />
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-3xl font-bold tracking-tight text-balance text-navy sm:text-4xl">{inst.name}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <VerificationBadge state="verified" verifiedAt={inst.verifiedAt} label="Verified by Venkat Sai" timeZone={tz} />
                {kind ? <MetaItem icon={<School />}>{kind}</MetaItem> : null}
                {place ? <MetaItem icon={<MapPin />}>{place}</MetaItem> : null}
                {inst.establishedYear ? <MetaItem icon={<CalendarDays />}>Established {inst.establishedYear}</MetaItem> : null}
                {website ? (
                  <MetaItem icon={<Globe />}>
                    <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-teal-strong hover:underline">
                      Website<span className="sr-only"> of {inst.name} (opens in a new tab)</span>
                    </a>
                  </MetaItem>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container-page grid gap-10 py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <PublicSection title="Courses" id="courses" className="pt-0">
            {courses?.items.length ? (
              <ul className="grid gap-5 sm:grid-cols-2" aria-label={`Courses from ${inst.name}`}>
                {courses.items.map((c) => {
                  const d = duration(c);
                  const next = c.nextBatch ? calendarDate(c.nextBatch.startsOn) : null;
                  return (
                    <li key={c.id} className="relative flex flex-col rounded-xl border border-border/80 bg-card p-5 shadow-xs focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
                      <p className="text-xs font-semibold text-teal-strong">{COURSE_CATEGORY_LABELS[c.category] ?? "Course"}</p>
                      <h3 className="mt-1 font-heading text-lg leading-snug font-semibold text-navy">
                        <Link href={`/training/${c.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none">
                          {c.title}
                        </Link>
                      </h3>
                      {c.summary ? <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{c.summary}</p> : null}
                      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <BookOpen className="size-3.5" aria-hidden="true" />
                          {COURSE_MODE_LABELS[c.mode]}
                        </span>
                        {d ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5" aria-hidden="true" />
                            {d}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1">
                          <Award className="size-3.5" aria-hidden="true" />
                          {COURSE_CERTIFICATION_TYPE_LABELS[c.certificationType]}
                        </span>
                        <span>
                          {c.feeType === "free" ? "Free" : c.feeType === "fixed" && c.feeMinor != null && c.feeCurrency ? <MoneyText amountMinor={c.feeMinor} currency={c.feeCurrency} /> : "Fee on request"}
                        </span>
                        {next ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="size-3.5" aria-hidden="true" />
                            Next batch <DateText value={next} dateOnly />
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                size="sm"
                icon={<GraduationCap />}
                title="No courses published yet"
                description={`${inst.name} has not published courses on ${BRAND.name} yet. Browse other training programmes in the meantime.`}
                primaryAction={{ label: "Browse training", href: "/training" }}
              />
            )}
            {courses && courses.total > courses.items.length ? (
              <p className="mt-4 text-sm">
                <Link href={`/training?institution=${encodeURIComponent(inst.slug)}`} className="font-semibold text-teal-strong hover:underline">
                  See all {courses.total} courses
                </Link>
              </p>
            ) : null}
            <p className="mt-4 text-xs text-muted-foreground">Course fees are never a condition of a job application, offer or placement.</p>
          </PublicSection>

          {inst.aboutHtml || inst.description ? (
            <PublicSection title={`About ${inst.name}`} id="about">
              {inst.aboutHtml ? <SafeHtml html={inst.aboutHtml} className="max-w-[72ch]" /> : <p className="max-w-[72ch] whitespace-pre-line">{inst.description}</p>}
              <p className="mt-4 text-xs text-muted-foreground">Institution information is provided by the institution.</p>
            </PublicSection>
          ) : null}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start" aria-label="Institution details">
          <section aria-labelledby="inst-credentials-title" className="rounded-xl border border-border/80 bg-card p-6 text-sm">
            <h2 id="inst-credentials-title" className="flex items-center gap-2 font-heading text-lg font-semibold text-navy">
              <Landmark className="size-5 text-teal" aria-hidden="true" />
              Affiliations
            </h2>
            <dl className="mt-4 space-y-3">
              {inst.declaredAffiliation ? (
                <div>
                  <dt className="text-muted-foreground">Affiliation (declared by the institution)</dt>
                  <dd className="font-medium">{inst.declaredAffiliation}</dd>
                </div>
              ) : null}
              {inst.declaredAccreditationBodies.length ? (
                <div>
                  <dt className="text-muted-foreground">Accreditation bodies (declared by the institution)</dt>
                  <dd className="font-medium">{inst.declaredAccreditationBodies.join(", ")}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">Accredited certificates on {BRAND.name}</dt>
                <dd className="font-medium">
                  {inst.authorisedCertificateIssuer ? (
                    <>
                      Authorised by Venkat Sai to issue accredited certificates
                      {inst.authorisedCertificateIssuer.scope ? ` for ${inst.authorisedCertificateIssuer.scope}` : ""}
                      {authorisedUntil ? (
                        <>
                          {" "}
                          until <DateText value={authorisedUntil} dateOnly />
                        </>
                      ) : null}
                    </>
                  ) : (
                    "Not authorised to issue accredited certificates on this platform"
                  )}
                </dd>
              </div>
            </dl>
            {!inst.declaredAffiliation && !inst.declaredAccreditationBodies.length ? (
              <p className="mt-3 text-xs text-muted-foreground">No affiliations have been declared.</p>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
