import { Megaphone } from "lucide-react";
import type { Metadata } from "next";

import { PageHero } from "@/components/public/page-hero";
import { CallButton, FollowWhatsAppLink, WhatsAppButton } from "@/components/public/requirements/contact-buttons";
import { loadPosterCountries, loadPosterPage, whatsappGroupUrlFrom } from "@/components/public/requirements/data";
import { getSiteSettings } from "@/components/public/site-data";
import { PosterGrid } from "@/components/public/requirements/poster-card";
import { QuickCvCta } from "@/components/public/requirements/quick-cv-cta";
import { buildPageMetadata } from "@/components/public/server";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { Pagination } from "@/components/shared/pagination";
import { sp as pick, type SearchParams } from "@/lib/http";

type Props = { searchParams: Promise<SearchParams> };

function parseFilters(sp: SearchParams): { country: string | undefined; page: number } {
  const country = pick(sp, "country")?.toUpperCase();
  const page = Number.parseInt(pick(sp, "page") ?? "1", 10);
  return { country: country && /^[A-Z]{2}$/.test(country) ? country : undefined, page: Number.isFinite(page) && page > 0 && page < 10_000 ? page : 1 };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { country, page } = parseFilters(await searchParams);
  return buildPageMetadata({
    title: "Latest overseas requirements",
    description: "Current overseas job requirements from Venkat Sai Global: trades, countries, salary and benefits. Send your CV or contact us on WhatsApp.",
    path: country ? `/requirements?country=${country}` : "/requirements",
    noindex: page > 1,
  });
}

export default async function RequirementsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { country, page } = parseFilters(sp);
  const [result, countries, settings] = await Promise.all([loadPosterPage({ page, pageSize: 12, country }), loadPosterCountries(), getSiteSettings()]);
  const countryName = country ? (countries.find((c) => c.code === country)?.name ?? country) : null;

  return (
    <>
      <PageHero
        eyebrow="Jobs abroad"
        title="Latest requirements"
        intro="Current requirements from our overseas employers. Send your CV and trade, or message us on WhatsApp, and our team will call you. We never charge candidates to apply."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Requirements" }]}
        actions={
          <>
            <WhatsAppButton message="Hello Venkat Sai, I would like to know about your latest requirements." />
            <CallButton className="border border-white/30 bg-white/5 hover:bg-white/10" />
          </>
        }
      />
      <div className="container-page py-10 sm:py-14">
        {countries.length > 1 ? (
          <LinkTabs
            label="Filter by country"
            className="mb-8"
            items={[{ href: "/requirements", label: "All countries" }, ...countries.map((c) => ({ href: `/requirements?country=${c.code}`, label: c.name }))]}
            activeHref={country ? `/requirements?country=${country}` : "/requirements"}
          />
        ) : null}
        {result.items.length ? (
          <>
            <h2 className="sr-only">{countryName ? `Requirements in ${countryName}` : "All requirements"}</h2>
            <PosterGrid posters={result.items} label={countryName ? `Requirements in ${countryName}` : "Latest requirements"} />
            <Pagination
              className="mt-10"
              pathname="/requirements"
              searchParams={sp}
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              pageSize={result.pageSize}
              itemLabel="requirements"
            />
          </>
        ) : (
          <EmptyState
            icon={<Megaphone />}
            titleAs="h2"
            title={countryName ? `No current requirements for ${countryName}` : "No requirements posted right now"}
            description="New requirements are posted here as soon as employers send them. Send your CV and trade now and we will call you when a suitable job comes up."
            primaryAction={{ label: "Send your CV", href: "/send-cv" }}
            secondaryAction={country ? { label: "All countries", href: "/requirements", variant: "outline" } : { label: "Browse jobs", href: "/jobs", variant: "outline" }}
          />
        )}
      </div>
      <div className="container-page pb-10">
        <FollowWhatsAppLink groupUrl={whatsappGroupUrlFrom(settings)} className="w-full sm:w-auto" />
      </div>
      <QuickCvCta />
    </>
  );
}
