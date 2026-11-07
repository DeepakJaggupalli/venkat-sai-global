import { BookOpen, CalendarDays, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { getPublishedEntries } from "@/modules/content/queries";

import { EntryCard, EntryGrid } from "../../news/_components/entry-card";
import { PublicHero, PublicSection } from "../../news/_components/public-hero";
import { assetFor, emptyEntryPage, listingMetadata, safeLoad, siteTimeZone, type PageSearchParams } from "../../news/_lib/cms";
import { normaliseQuery, pageParam, readingMinutes } from "../../news/_lib/text";

/** Blog categories are free text in the CMS (letters, numbers, spaces, & and -). */
function categoryParam(value: string | string[] | undefined): string | undefined {
  const raw = normaliseQuery(value, 60);
  return raw && /^[A-Za-z0-9][A-Za-z0-9 &-]*$/.test(raw) ? raw : undefined;
}

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const category = categoryParam(sp.category);
  return listingMetadata(
    category ? `${category} · Blog` : "Blog and career guidance",
    "Articles and practical career guidance from the Venkat Sai Global team.",
    category ? `/blog?category=${encodeURIComponent(category)}` : "/blog",
    { noindex: pageParam(sp.page) > 1 },
  );
}

export default async function BlogPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const category = categoryParam(sp.category);
  const page = pageParam(sp.page);
  const result = await safeLoad("blog", () => getPublishedEntries("blog_posts", { category, page, pageSize: 12 }), emptyEntryPage<"blog_posts">());
  const tz = siteTimeZone();

  return (
    <>
      <PublicHero
        eyebrow="Blog"
        title={category ?? "Blog and career guidance"}
        description="Practical articles on careers, skills, training and working abroad safely."
        breadcrumbs={category ? [{ label: "Blog", href: "/blog" }, { label: category }] : [{ label: "Blog" }]}
        actions={
          category ? (
            <Link href="/blog" className="text-sm font-semibold text-teal-strong underline-offset-4 hover:underline">
              Show all articles
            </Link>
          ) : undefined
        }
      />
      <div className="container-page">
        <PublicSection>
          {result.items.length ? (
            <>
              <EntryGrid label={category ? `Articles in ${category}` : "Articles"}>
                {result.items.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    href={entry.path ?? `/blog/${entry.slug}`}
                    title={entry.title}
                    summary={entry.summary}
                    eyebrow={entry.data.category || undefined}
                    image={assetFor(result.assets, entry.heroAssetId)}
                    placeholderIcon={<BookOpen />}
                    meta={
                      <>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" aria-hidden="true" />
                          <DateText value={entry.publishedAt} timeZone={tz} />
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="size-3.5" aria-hidden="true" />
                          {readingMinutes(entry.data.body)} min read
                        </span>
                        {entry.data.author ? <span>By {entry.data.author}</span> : null}
                      </>
                    }
                  />
                ))}
              </EntryGrid>
              <Pagination className="mt-10" pathname="/blog" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="articles" />
            </>
          ) : (
            <EmptyState
              icon={<BookOpen />}
              titleAs="h2"
              title={category ? `No articles in ${category} yet` : "No articles published yet"}
              description="Career guidance articles will appear here once they are published. Our FAQs answer the most common questions in the meantime."
              primaryAction={{ label: "Read the FAQs", href: "/faqs" }}
              secondaryAction={category ? { label: "All articles", href: "/blog", variant: "outline" } : { label: "Browse jobs", href: "/jobs", variant: "outline" }}
            />
          )}
        </PublicSection>
      </div>
    </>
  );
}
