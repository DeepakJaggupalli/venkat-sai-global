import { Building2, CalendarDays, Globe, Mail, MapPin, Phone, Plane, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { OrgAvatar } from "@/components/shared/avatars";
import { SafeHtml } from "@/components/shared/safe-html";
import { VerificationBadge } from "@/components/shared/verification-badge";
import { BRAND } from "@/config/site";
import { humanize } from "@/lib/format";
import { getPublicCompany } from "@/modules/organizations/employer";

import { JsonLd } from "../../news/_components/json-ld";
import { MetaItem, PublicSection } from "../../news/_components/public-hero";
import { abs, breadcrumbJsonLd, safeLoad, siteTimeZone } from "../../news/_lib/cms";
import { excerptText, telHref } from "../../news/_lib/text";
import { PageBreadcrumbs } from "@/components/shared/page-header";
import { CompanyJobs } from "./_components/company-jobs";
import { listCompanyPublicJobs } from "./_lib/queries";

type Props = { params: Promise<{ slug: string }> };

const loadCompany = cache((slug: string) => (/^[a-z0-9][a-z0-9-]{0,119}$/i.test(slug) ? getPublicCompany(slug) : Promise.resolve(null)));

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const company = await loadCompany(slug);
  if (!company) return { title: "Employer not found", robots: { index: false } };
  const description = company.profile.employerBrandingTagline || excerptText(company.profile.aboutHtml ?? company.description, 160) || `${company.name} on ${BRAND.name}.`;
  return {
    title: `${company.name} · Employer`,
    description,
    alternates: { canonical: `/employers/${company.slug}` },
    openGraph: { type: "website", title: company.name, description, url: `/employers/${company.slug}`, ...(company.logo ? { images: [{ url: company.logo.url, alt: "" }] } : {}) },
  };
}

export default async function EmployerProfilePage({ params }: Props) {
  const { slug } = await params;
  const company = await loadCompany(slug);
  if (!company) notFound();
  const p = company.profile;
  const tz = siteTimeZone();
  const jobs = await safeLoad("employer.jobs", () => listCompanyPublicJobs(company.id, 20), []);
  const website = safeHttpUrl(company.websiteUrl);
  const place = [company.city, company.countryName].filter(Boolean).join(", ");
  const socials = Object.entries(p.socialLinks ?? {})
    .map(([key, url]) => [key, safeHttpUrl(url)] as const)
    .filter((e): e is readonly [string, string] => Boolean(e[1]));
  const facts: { label: string; value: string }[] = [
    company.industryName ? { label: "Industry", value: company.industryName } : null,
    p.companySize ? { label: "Company size", value: `${humanize(p.companySize)} employees` } : null,
    p.foundedYear ? { label: "Founded", value: String(p.foundedYear) } : null,
    p.headquartersCountryName ? { label: "Headquarters", value: p.headquartersCountryName } : null,
    p.hiringRegions.length ? { label: "Hiring in", value: p.hiringRegions.map(humanize).join(", ") } : null,
  ].filter((f): f is { label: string; value: string } => Boolean(f));

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: company.name,
            url: abs(`/employers/${company.slug}`),
            ...(website ? { sameAs: [website, ...socials.map(([, url]) => url)] } : socials.length ? { sameAs: socials.map(([, url]) => url) } : {}),
            ...(company.logo ? { logo: company.logo.url } : {}),
            ...(place ? { address: { "@type": "PostalAddress", addressLocality: company.city ?? undefined, addressCountry: company.countryCode ?? undefined } } : {}),
            ...(p.foundedYear ? { foundingDate: String(p.foundedYear) } : {}),
          },
          breadcrumbJsonLd([{ name: "Home", url: abs("/") }, { name: "Employers", url: abs("/employers") }, { name: company.name }]),
        ]}
      />
      <section className="border-b border-border/70 bg-surface-subtle">
        {p.cover ? (
          // Cover images are public organisation media; decorative.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.cover.url} alt="" className="h-36 w-full object-cover sm:h-52" />
        ) : null}
        <div className="container-page py-8 sm:py-10">
          <PageBreadcrumbs items={[{ label: "Home", href: "/" }, { label: "Employers", href: "/employers" }, { label: company.name }]} className="mb-6" />
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <OrgAvatar name={company.name} src={company.logo?.thumbnailUrl ?? company.logo?.url ?? null} size="xl" verified={Boolean(company.verifiedAt)} />
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-3xl font-bold tracking-tight text-balance text-navy sm:text-4xl">{company.name}</h1>
              {p.employerBrandingTagline ? <p className="mt-2 text-lg text-muted-foreground">{p.employerBrandingTagline}</p> : null}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <VerificationBadge state="verified" verifiedAt={company.verifiedAt} label="Verified by Venkat Sai" timeZone={tz} />
                {company.industryName ? <MetaItem icon={<Building2 />}>{company.industryName}</MetaItem> : null}
                {place ? <MetaItem icon={<MapPin />}>{place}</MetaItem> : null}
                {p.isHiringOverseas ? <MetaItem icon={<Plane />}>Hiring for overseas roles</MetaItem> : null}
                {website ? (
                  <MetaItem icon={<Globe />}>
                    <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-teal-strong hover:underline">
                      Website<span className="sr-only"> of {company.name} (opens in a new tab)</span>
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
          <PublicSection title={`Open jobs at ${company.name}`} id="jobs" className="pt-0">
            {jobs.length ? (
              <CompanyJobs jobs={jobs} timeZone={tz} />
            ) : (
              <EmptyState
                size="sm"
                icon={<Users />}
                title="No open jobs right now"
                description={`${company.name} has no jobs open on ${BRAND.name} at the moment. Browse other opportunities, or create a job alert to hear about new roles.`}
                primaryAction={{ label: "Browse all jobs", href: "/jobs" }}
              />
            )}
          </PublicSection>

          {p.aboutHtml || company.description ? (
            <PublicSection title={`About ${company.name}`} id="about">
              {p.aboutHtml ? <SafeHtml html={p.aboutHtml} className="max-w-[72ch]" /> : <p className="max-w-[72ch] whitespace-pre-line">{company.description}</p>}
              <p className="mt-4 text-xs text-muted-foreground">Company information is provided by the employer.</p>
            </PublicSection>
          ) : null}

          {p.typicalRoles.length || p.benefitsOffered.length ? (
            <PublicSection title="Working here" id="working-here">
              <div className="grid gap-6 sm:grid-cols-2">
                {p.typicalRoles.length ? (
                  <div>
                    <h3 className="font-semibold text-navy">Typical roles</h3>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {p.typicalRoles.map((r) => (
                        <li key={r} className="rounded-full bg-muted px-3 py-1 text-sm">
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {p.benefitsOffered.length ? (
                  <div>
                    <h3 className="font-semibold text-navy">Benefits offered</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {p.benefitsOffered.map((b) => (
                        <li key={b}>{humanize(b)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </PublicSection>
          ) : null}

          {p.cultureMedia.length ? (
            <PublicSection title="Life at the company" id="culture">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {p.cultureMedia.map((img) => (
                  <li key={img.id} className="aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.thumbnailUrl ?? img.url} alt="" loading="lazy" className="size-full object-cover" />
                  </li>
                ))}
              </ul>
            </PublicSection>
          ) : null}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start" aria-label="Company details">
          {facts.length ? (
            <section aria-labelledby="company-facts-title" className="rounded-xl border border-border/80 bg-card p-6 text-sm">
              <h2 id="company-facts-title" className="font-heading text-lg font-semibold text-navy">
                Company facts
              </h2>
              <dl className="mt-4 space-y-3">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {p.publicContactEmail || p.publicContactPhone || socials.length ? (
            <section aria-labelledby="company-contact-title" className="rounded-xl border border-border/80 bg-card p-6 text-sm">
              <h2 id="company-contact-title" className="font-heading text-lg font-semibold text-navy">
                Contact
              </h2>
              <ul className="mt-4 space-y-2">
                {p.publicContactEmail ? (
                  <li className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                    <a href={`mailto:${p.publicContactEmail}`} className="font-medium break-all text-teal-strong hover:underline">
                      {p.publicContactEmail}
                    </a>
                  </li>
                ) : null}
                {p.publicContactPhone ? (
                  <li className="flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
                    <a href={telHref(p.publicContactPhone)} className="font-medium text-teal-strong hover:underline">
                      {p.publicContactPhone}
                    </a>
                  </li>
                ) : null}
                {socials.map(([key, url]) => (
                  <li key={key}>
                    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-teal-strong hover:underline">
                      {humanize(key)}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">Apply for jobs through {BRAND.name}. Candidates are never charged to apply.</p>
            </section>
          ) : null}
          <section aria-labelledby="company-verified-title" className="rounded-xl border border-border/80 bg-surface-subtle p-6 text-sm">
            <h2 id="company-verified-title" className="flex items-center gap-2 font-heading text-base font-semibold text-navy">
              <CalendarDays className="size-4 text-teal" aria-hidden="true" />
              About verification
            </h2>
            <p className="mt-2 text-muted-foreground">
              Venkat Sai checks an employer&apos;s registration documents before its page and jobs go live. If an offer in this employer&apos;s name asks you to pay,
              do not pay and <Link href="/grievance" className="font-medium text-teal-strong hover:underline">report it</Link>.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
