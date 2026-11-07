import { CalendarDays, Newspaper } from "lucide-react";
import type { Metadata } from "next";

import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { Pagination } from "@/components/shared/pagination";
import { NEWS_CATEGORY_OPTIONS } from "@/modules/content/collections";
import { getPublishedEntries } from "@/modules/content/queries";

import { EntryCard, EntryGrid } from "../_components/entry-card";
import { PublicHero, PublicSection } from "../_components/public-hero";
import { assetFor, emptyEntryPage, listingMetadata, safeLoad, siteTimeZone, type PageSearchParams } from "../_lib/cms";
import { pageParam, pickParam } from "../_lib/text";

const CATEGORY_VALUES = NEWS_CATEGORY_OPTIONS.map((o) => o.value);
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(NEWS_CATEGORY_OPTIONS.map((o) => [o.value, o.label]));

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const category = pickParam(sp.category, CATEGORY_VALUES);
  const title = category ? `${CATEGORY_LABEL[category]} · News` : "News and announcements";
  return listingMetadata(title, "News, announcements, hiring drives and training updates from Venkat Sai Global.", category ? `/news?category=${category}` : "/news", {
    noindex: pageParam(sp.page) > 1,
  });
}

export default async function NewsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const category = pickParam(sp.category, CATEGORY_VALUES);
  const page = pageParam(sp.page);
  const result = await safeLoad("news", () => getPublishedEntries("news", { category, page, pageSize: 12 }), emptyEntryPage<"news">());
  const tz = siteTimeZone();

  return (
    <>
      <PublicHero
        eyebrow="Newsroom"
        title="News and announcements"
        description="Company updates, hiring drives, training announcements and placement news from Venkat Sai Global."
        breadcrumbs={[{ label: "News" }]}
      />
      <div className="container-page">
        <PublicSection>
          <LinkTabs
            label="News categories"
            className="mb-8"
            items={[{ href: "/news", label: "All" }, ...NEWS_CATEGORY_OPTIONS.map((o) => ({ href: `/news?category=${o.value}`, label: o.label }))]}
            activeHref={category ? `/news?category=${category}` : "/news"}
          />
          {result.items.length ? (
            <>
              <EntryGrid label={category ? CATEGORY_LABEL[category] : "Latest news"}>
                {result.items.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    href={entry.path ?? `/news/${entry.slug}`}
                    title={entry.title}
                    summary={entry.summary}
                    eyebrow={CATEGORY_LABEL[entry.data.category] ?? "News"}
                    image={assetFor(result.assets, entry.heroAssetId)}
                    placeholderIcon={<Newspaper />}
                    meta={
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        <DateText value={entry.publishedAt} timeZone={tz} />
                      </span>
                    }
                  />
                ))}
              </EntryGrid>
              <Pagination
                className="mt-10"
                pathname="/news"
                searchParams={sp}
                page={result.page}
                pageCount={result.pageCount}
                total={result.total}
                pageSize={result.pageSize}
                itemLabel="news items"
              />
            </>
          ) : (
            <EmptyState
              icon={<Newspaper />}
              titleAs="h2"
              title={category ? `No ${CATEGORY_LABEL[category]?.toLowerCase()} items yet` : "No news published yet"}
              description="When we publish news, hiring drives or training announcements, they will appear here. You can browse current openings in the meantime."
              primaryAction={{ label: "Browse jobs", href: "/jobs" }}
              secondaryAction={category ? { label: "All news", href: "/news", variant: "outline" } : { label: "Upcoming events", href: "/events", variant: "outline" }}
            />
          )}
        </PublicSection>
      </div>
    </>
  );
}
