import { Award, Building2, MapPin, MessageSquareQuote } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { Pagination } from "@/components/shared/pagination";
import { TESTIMONIAL_TYPE_OPTIONS } from "@/modules/content/collections";
import { getPublishedEntries } from "@/modules/content/queries";
import { industryOptions } from "@/modules/taxonomy/queries";

import { countryName } from "../../events/_lib/schedule";
import { EntryCard, EntryGrid } from "../../news/_components/entry-card";
import { PublicHero, PublicSection } from "../../news/_components/public-hero";
import { assetFor, emptyEntryPage, listingMetadata, safeLoad, type PageSearchParams } from "../../news/_lib/cms";
import { pageParam, pickParam } from "../../news/_lib/text";
import { TestimonialCard } from "../_components/testimonial-card";

const TYPE_VALUES = TESTIMONIAL_TYPE_OPTIONS.map((o) => o.value);

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  return listingMetadata(
    "Success stories",
    "Verified case studies and testimonials, published with the consent of the people and organisations involved.",
    "/success-stories",
    { noindex: pageParam(sp.page) > 1 || Boolean(sp.type) },
  );
}

export default async function SuccessStoriesPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const type = pickParam(sp.type, TYPE_VALUES);
  const [stories, testimonials, industries] = await Promise.all([
    safeLoad("case_studies", () => getPublishedEntries("case_studies", { page, pageSize: 9 }), emptyEntryPage<"case_studies">(9)),
    safeLoad("testimonials", () => getPublishedEntries("testimonials", { category: type, limit: 24 }), emptyEntryPage<"testimonials">(24)),
    safeLoad("industries", () => industryOptions(), []),
  ]);
  const industryName = new Map(industries.map((o) => [o.value, o.label]));
  const nothing = !stories.items.length && !testimonials.items.length && !type;

  return (
    <>
      <PublicHero
        eyebrow="Success stories"
        title="Real work, real outcomes"
        description="Case studies and testimonials from real engagements. Each one is published only with the written consent of the people and organisations involved, and states only results we can evidence."
        breadcrumbs={[{ label: "Success stories" }]}
      />
      <div className="container-page">
        {nothing ? (
          <PublicSection>
            <EmptyState
              icon={<Award />}
              titleAs="h2"
              title="Our first stories are on their way"
              description="We publish case studies and testimonials only after the people and organisations involved have given written consent. Until then, you can see how we work or tell us about your hiring needs."
              primaryAction={{ label: "Our services", href: "/services" }}
              secondaryAction={{ label: "Contact us", href: "/contact", variant: "outline" }}
            />
          </PublicSection>
        ) : (
          <>
            <PublicSection title="Case studies" id="case-studies" description="How we met real workforce requirements, from brief to outcome.">
              {stories.items.length ? (
                <>
                  <EntryGrid label="Case studies">
                    {stories.items.map((entry) => {
                      const d = entry.data;
                      const country = countryName(d.countryCode);
                      const industry = d.industryId ? industryName.get(d.industryId) : null;
                      return (
                        <EntryCard
                          key={entry.id}
                          href={entry.path ?? `/success-stories/${entry.slug}`}
                          title={entry.title}
                          summary={entry.summary}
                          eyebrow={d.clientName || d.clientDescriptor}
                          image={assetFor(stories.assets, entry.heroAssetId)}
                          placeholderIcon={<Award />}
                          meta={
                            <>
                              {industry ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Building2 className="size-3.5" aria-hidden="true" />
                                  {industry}
                                </span>
                              ) : null}
                              {country ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <MapPin className="size-3.5" aria-hidden="true" />
                                  {country}
                                </span>
                              ) : null}
                            </>
                          }
                        />
                      );
                    })}
                  </EntryGrid>
                  <Pagination
                    className="mt-10"
                    pathname="/success-stories"
                    searchParams={sp}
                    page={stories.page}
                    pageCount={stories.pageCount}
                    total={stories.total}
                    pageSize={stories.pageSize}
                    itemLabel="case studies"
                  />
                </>
              ) : (
                <EmptyState size="sm" icon={<Award />} title="No case studies published yet" description="Case studies appear here once the client has given written consent." />
              )}
            </PublicSection>

            <PublicSection title="Testimonials" id="testimonials" description="In their own words, shared with their consent." className="border-t border-border/70">
              <LinkTabs
                label="Testimonials by group"
                className="mb-6"
                items={[
                  { href: "/success-stories#testimonials", label: "All" },
                  ...TESTIMONIAL_TYPE_OPTIONS.filter((o) => o.value !== "other").map((o) => ({ href: `/success-stories?type=${o.value}#testimonials`, label: o.label })),
                ]}
                activeHref={type ? `/success-stories?type=${type}#testimonials` : "/success-stories#testimonials"}
              />
              {testimonials.items.length ? (
                <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Testimonials">
                  {testimonials.items.map((entry) => (
                    <li key={entry.id}>
                      <TestimonialCard entry={entry} assets={testimonials.assets} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState size="sm" icon={<MessageSquareQuote />} title="No testimonials in this group yet" description="Testimonials appear here once the person has given consent." />
              )}
            </PublicSection>
          </>
        )}
      </div>
    </>
  );
}
