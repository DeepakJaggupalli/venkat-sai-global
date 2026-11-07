import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { CtaBand, EntryCard } from "@/components/public/blocks";
import { pickAsset } from "@/components/public/cms-media";
import { PageHero } from "@/components/public/page-hero";
import { Section } from "@/components/public/section";
import { buildPageMetadata, settle } from "@/components/public/server";
import { getPublishedEntries } from "@/modules/content/queries";

export const metadata: Metadata = buildPageMetadata({
  title: "Industries",
  description: "The industries Venkat Sai Global recruits, trains and supplies skilled people for, in India and overseas.",
  path: "/industries",
});

export default async function IndustriesPage() {
  const page = await settle("industries.list", () => getPublishedEntries("industries", { limit: 100 }), null);
  const industries = page?.items ?? [];
  return (
    <>
      <PageHero
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Industries" }]}
        eyebrow="Industries"
        title="Skilled people for the industries that build"
        intro="Explore the sectors we work with, the roles employers ask for and the skills that open doors."
      />
      <Section tone="subtle" labelledBy="industries-list-title">
        <h2 id="industries-list-title" className="sr-only">
          All industries
        </h2>
        {industries.length ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="industries-list">
            {industries.map((i) => (
              <li key={i.id}>
                <EntryCard href={i.path ?? `/industries/${i.slug}`} title={i.title} summary={i.summary} iconName={i.data.iconName} image={pickAsset(page?.assets, i.heroAssetId)} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Industry pages are coming soon"
            description="We are preparing detailed pages for the industries we serve. In the meantime you can browse open jobs or talk to our team."
            primaryAction={{ label: "Browse jobs", href: "/jobs" }}
            secondaryAction={{ label: "Contact us", href: "/contact", variant: "outline" }}
          />
        )}
      </Section>
      <CtaBand
        location="industries_cta_band"
        heading="Hiring for your industry?"
        body="Share the roles, numbers and timelines and we will plan sourcing, screening and trade testing with you."
        primary={{ label: "Submit a workforce requirement", href: "/employers/request", id: "submit_workforce_requirement" }}
        secondary={{ label: "Explore opportunities", href: "/jobs", id: "explore_opportunities" }}
      />
    </>
  );
}
