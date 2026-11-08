import { ArrowRight, CalendarCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { CtaBand } from "@/components/public/blocks";
import { Flag } from "@/components/public/flag";
import { groupByReach } from "@/components/public/geo";
import { DEFAULT_DESTINATION_COUNTRIES } from "@/components/public/home/marquees";
import { SAFE_RECRUITMENT_PATH } from "@/components/public/links";
import { PageHero } from "@/components/public/page-hero";
import { Section, SectionHeading } from "@/components/public/section";
import { buildPageMetadata, settle } from "@/components/public/server";
import { stockPhoto } from "@/content/stock-photos";
import { getPublishedEntries } from "@/modules/content/queries";
import { listCountries } from "@/modules/taxonomy/queries";

export const metadata: Metadata = buildPageMetadata({
  title: "Global reach",
  description: "Country guides for the destinations Venkat Sai Global recruits for: hiring industries, documentation and reviewed employment guidance.",
  path: "/global-reach",
});

function reviewedLabel(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default async function GlobalReachPage() {
  const [page, countries] = await Promise.all([settle("destinations.list", () => getPublishedEntries("destinations", { limit: 100 }), null), settle("countries", () => listCountries(), [])]);
  const destinations = page?.items ?? [];
  const names = Object.fromEntries(countries.map((c) => [c.code, c.name]));
  const groups = groupByReach(destinations, (d) => d.data.region);
  const countryChips = destinations.length
    ? destinations.map((d) => ({ code: d.data.countryCode, name: names[d.data.countryCode] ?? d.title }))
    : DEFAULT_DESTINATION_COUNTRIES.filter((c) => c.code !== "IN");

  return (
    <>
      <PageHero
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Global reach" }]}
        eyebrow="Global reach"
        title="From Visakhapatnam to the world"
        intro="Country guides for the destinations we recruit for — the industries hiring, the documents candidates are usually asked for, and employment guidance that is reviewed and sourced."
        photo={stockPhoto("doha")}
      />

      <Section labelledBy="reach-map-title" className="pb-8 sm:pb-10 lg:pb-12">
        <SectionHeading
          id="reach-map-title"
          eyebrow="Destinations"
          title="Where our country guides cover"
          intro={
            destinations.length
              ? "Every guide shows when it was last reviewed. Rules change often — always confirm with the official sources listed on each page."
              : undefined
          }
        />
        <ul className="mt-10 flex flex-wrap gap-2.5" aria-label="Countries">
          {countryChips.map((c) => (
            <li key={c.code + c.name} className="inline-flex h-11 items-center gap-2.5 rounded-full border border-border bg-white px-4 text-[15px] font-medium text-foreground">
              <Flag code={c.code} />
              {c.name}
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="subtle" labelledBy="reach-groups-title" className="pt-10 sm:pt-12 lg:pt-14">
        <h2 id="reach-groups-title" className="sr-only">
          Destinations by region
        </h2>
        {groups.length ? (
          <div className="space-y-12" data-testid="destination-groups">
            {groups.map((g) => (
              <section key={g.group} aria-labelledby={`reach-${g.group}`}>
                <h3 id={`reach-${g.group}`} className="font-heading text-xl font-bold tracking-tight text-foreground">
                  {g.label}
                </h3>
                <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map((d) => {
                    const reviewed = reviewedLabel(d.data.guidance?.reviewedAt);
                    return (
                      <li key={d.id}>
                        <Link
                          href={d.path ?? `/global-reach/${d.slug}`}
                          className="card-surface lift group flex h-full flex-col rounded-2xl p-5 focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <span className="flex items-center gap-3">
                            <Flag code={d.data.countryCode} className="h-5 w-7" />
                            <span className="font-heading text-lg font-bold tracking-tight text-foreground">{d.title}</span>
                            <ArrowRight aria-hidden="true" className="ml-auto size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
                          </span>
                          {d.summary ? <span className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{d.summary}</span> : null}
                          {reviewed ? (
                            <span className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <CalendarCheck aria-hidden="true" className="size-3.5" />
                              Last reviewed {reviewed}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Country guides are being reviewed"
            description="We publish a destination guide only after its employment and immigration guidance has been checked against official sources. Browse overseas jobs in the meantime."
            primaryAction={{ label: "Browse overseas jobs", href: "/jobs?overseas=1" }}
            secondaryAction={{ label: "How to recruit safely", href: SAFE_RECRUITMENT_PATH, variant: "outline" }}
          />
        )}
      </Section>

      <CtaBand
        location="global_reach_cta_band"
        heading="Thinking about working abroad?"
        body="Build your profile, apply for verified overseas roles and never pay anyone for a job. Venkat Sai never charges candidates."
        primary={{ label: "Build your career profile", href: "/sign-up", id: "build_career_profile" }}
        secondary={{ label: "How to recruit safely", href: SAFE_RECRUITMENT_PATH, id: "safe_recruitment" }}
      />
    </>
  );
}
