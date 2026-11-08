import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { CtaBand, EntryCard } from "@/components/public/blocks";
import { pickAsset } from "@/components/public/cms-media";
import { CtaLink } from "@/components/public/cta-link";
import { PageHero } from "@/components/public/page-hero";
import { Section, SectionHeading } from "@/components/public/section";
import { buildPageMetadata, settle } from "@/components/public/server";
import { FeaturedServiceCard, hasTag, SERVICE_TAGS } from "@/components/public/services/featured-service-card";
import { CourseFamilyGrid } from "@/components/public/training-catalog/course-family-grid";
import { stockPhoto } from "@/content/stock-photos";
import { getPublishedEntries } from "@/modules/content/queries";

export const metadata: Metadata = buildPageMetadata({
  title: "Services",
  description:
    "Overseas employment, trade training and manpower supply from Venkat Sai Welding Works and Testing Center, Autonagar, Gajuwaka, Visakhapatnam, plus internships, trade testing and more.",
  path: "/services",
});

/**
 * Services: the main services (entries marked featured in the CMS, in their manual order) as large cards, then
 * every other active service under "All services", then the training course families (tag "training-course").
 */
export default async function ServicesPage() {
  const page = await settle("services.list", () => getPublishedEntries("services", { limit: 100 }), null);
  const services = (page?.items ?? []).filter((s) => s.data.isActive !== false);
  const courses = services.filter((s) => hasTag(s, SERVICE_TAGS.trainingCourse));
  const listed = services.filter((s) => !hasTag(s, SERVICE_TAGS.trainingCourse));
  const featured = listed.filter((s) => s.isFeatured);
  const others = listed.filter((s) => !s.isFeatured);
  const empty = !services.length;

  return (
    <>
      <PageHero
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Services" }]}
        eyebrow="What we do"
        title="Overseas jobs, trade training and manpower supply"
        intro="From our centre in Autonagar, Gajuwaka, Visakhapatnam, we train and test tradespeople, send them to jobs abroad and supply skilled teams to companies."
        photo={stockPhoto("workshop")}
        actions={
          <>
            <CtaLink href="/send-cv" cta="send_cv" location="services_hero" variant="primary" arrow>
              Send your CV
            </CtaLink>
            <CtaLink href="/employers/request" cta="submit_workforce_requirement" location="services_hero" variant="outline">
              Request workers
            </CtaLink>
          </>
        }
      />

      {featured.length ? (
        <Section labelledBy="services-main-title" data-testid="services-featured">
          <SectionHeading id="services-main-title" eyebrow="Main services" title="How we can help" />
          <ul className="mt-12 grid gap-6 lg:grid-cols-3">
            {featured.map((s) => (
              <li key={s.id}>
                <FeaturedServiceCard entry={s} assets={page?.assets} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section tone="subtle" labelledBy="services-list-title" id="all-services" className="scroll-mt-24">
        <SectionHeading
          id="services-list-title"
          eyebrow="All services"
          title={featured.length ? "More from Venkat Sai" : "All services"}
          intro={featured.length && others.length ? "Internships, trade testing, recruitment and the other services we offer." : undefined}
        />
        {others.length ? (
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="services-list">
            {others.map((s) => (
              <li key={s.id}>
                <EntryCard href={s.path ?? `/services/${s.slug}`} title={s.title} summary={s.summary} iconName={s.data.iconName} image={pickAsset(page?.assets, s.heroAssetId)} headingLevel="h3" />
              </li>
            ))}
          </ul>
        ) : null}
        {courses.length ? (
          <div className="mt-20">
            <h3 className="font-display text-2xl text-foreground sm:text-[2rem]">Training courses</h3>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">Every course ends with a completion certificate and includes trade test preparation for overseas interviews.</p>
            <CourseFamilyGrid families={courses} assets={page?.assets} compact className="mt-8" />
          </div>
        ) : null}
        {empty ? (
          <EmptyState
            className="mt-10"
            title="Service pages are being prepared"
            description="Our service descriptions are being updated. Tell us what you need and our team will get back to you."
            primaryAction={{ label: "Contact us", href: "/contact" }}
            secondaryAction={{ label: "Submit a workforce requirement", href: "/employers/request" }}
          />
        ) : null}
      </Section>

      <CtaBand
        location="services_cta_band"
        heading="Not sure which service fits?"
        body="Tell us about your trade, your training plans or the workers you need, and the right person at Venkat Sai will reply."
        primary={{ label: "Contact our team", href: "/contact", id: "contact_team" }}
        secondary={{ label: "Explore jobs", href: "/jobs", id: "explore_jobs" }}
      />
    </>
  );
}
