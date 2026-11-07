import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { CtaBand, EntryCard } from "@/components/public/blocks";
import { pickAsset } from "@/components/public/cms-media";
import { CtaLink } from "@/components/public/cta-link";
import { PageHero } from "@/components/public/page-hero";
import { Section } from "@/components/public/section";
import { buildPageMetadata, settle } from "@/components/public/server";
import { getPublishedEntries } from "@/modules/content/queries";

export const metadata: Metadata = buildPageMetadata({
  title: "Services",
  description: "Recruitment and placements, overseas employment, bulk manpower supply, training, skill assessment and welding and industrial testing from Venkat Sai Global.",
  path: "/services",
});

export default async function ServicesPage() {
  const page = await settle("services.list", () => getPublishedEntries("services", { limit: 100 }), null);
  const services = (page?.items ?? []).filter((s) => s.data.isActive !== false);
  return (
    <>
      <PageHero
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Services" }]}
        eyebrow="What we do"
        title="Services across the opportunity journey"
        intro="From skill development and testing to recruitment, overseas employment and workforce supply — delivered by one accountable team in Visakhapatnam."
        actions={
          <>
            <CtaLink href="/employers/request" cta="submit_workforce_requirement" location="services_hero" variant="accent" arrow>
              Submit a workforce requirement
            </CtaLink>
            <CtaLink href="/jobs" cta="explore_opportunities" location="services_hero" variant="onDark">
              Explore opportunities
            </CtaLink>
          </>
        }
      />
      <Section tone="subtle" labelledBy="services-list-title">
        <h2 id="services-list-title" className="sr-only">
          All services
        </h2>
        {services.length ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="services-list">
            {services.map((s) => (
              <li key={s.id}>
                <EntryCard href={s.path ?? `/services/${s.slug}`} title={s.title} summary={s.summary} iconName={s.data.iconName} image={pickAsset(page?.assets, s.heroAssetId)} headingLevel="h3" />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Service pages are being prepared"
            description="Our service descriptions are being updated. Tell us what you need and our team will get back to you."
            primaryAction={{ label: "Contact us", href: "/contact" }}
            secondaryAction={{ label: "Submit a workforce requirement", href: "/employers/request" }}
          />
        )}
      </Section>
      <CtaBand
        location="services_cta_band"
        heading="Not sure which service fits?"
        body="Tell us about your hiring, training or testing need and the right person at Venkat Sai will respond."
        primary={{ label: "Contact our team", href: "/contact", id: "contact_team" }}
        secondary={{ label: "Submit a workforce requirement", href: "/employers/request", id: "submit_workforce_requirement" }}
      />
    </>
  );
}
