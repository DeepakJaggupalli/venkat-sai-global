import { Briefcase, FileText, Search as SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CmsCollection } from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request";
import { searchContent } from "@/modules/content/queries";
import type { ContentSearchResult } from "@/modules/content/types";
import { parseJobSearchParams } from "@/modules/jobs/schemas";
import { searchJobs } from "@/modules/jobs/search";

import { CompanyJobs } from "../employers/[slug]/_components/company-jobs";
import { PublicHero, PublicSection } from "../news/_components/public-hero";
import { safeLoad, siteTimeZone, type PageSearchParams } from "../news/_lib/cms";
import { normaliseQuery, splitSnippet } from "../news/_lib/text";

export const metadata: Metadata = {
  title: "Search",
  description: "Search Venkat Sai Global: jobs, services, news, guidance and help pages.",
  robots: { index: false, follow: true },
};

const COLLECTION_LABEL: Partial<Record<CmsCollection, string>> = {
  services: "Service",
  industries: "Industry",
  destinations: "Destination",
  case_studies: "Success story",
  faqs: "FAQ",
  news: "News",
  blog_posts: "Blog",
  events: "Event",
  gallery_albums: "Gallery",
  videos: "Video",
  pages: "Page",
  about: "About",
};

function Snippet({ text }: { text: string | null }) {
  const parts = splitSnippet(text);
  if (!parts.length) return null;
  return (
    <p className="mt-1 text-sm leading-6 text-muted-foreground">
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-gold-soft px-0.5 text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const q = normaliseQuery(sp.q, 100);
  const tooShort = q.length > 0 && q.length < 2;
  let limited = false;
  let content: ContentSearchResult[] = [];
  let jobs: Awaited<ReturnType<typeof searchJobs>> | null = null;

  if (q.length >= 2) {
    const meta = await getRequestMeta();
    const rl = await rateLimit(`site-search:${meta.ipHash ?? "anon"}`, 30, 60);
    limited = !rl.allowed;
    if (!limited) {
      [content, jobs] = await Promise.all([
        safeLoad("search.content", () => searchContent(q, { limit: 20 }), []),
        safeLoad("search.jobs", () => searchJobs(parseJobSearchParams({ q, pageSize: "6", sort: "relevance" }), { kind: "public" }, { facets: false }), null),
      ]);
    }
  }
  const hasResults = content.length > 0 || Boolean(jobs?.items.length);

  return (
    <>
      <PublicHero eyebrow="Search" title={q ? `Results for “${q}”` : "Search the site"} breadcrumbs={[{ label: "Search" }]}>
        <form role="search" action="/search" method="get" className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row">
          <label htmlFor="site-search" className="sr-only">
            Search jobs, services, news and help
          </label>
          <Input id="site-search" type="search" name="q" defaultValue={q} placeholder="Search jobs, services, news and help" maxLength={100} minLength={2} className="h-11 bg-white" />
          <Button type="submit" size="lg" className="h-11">
            <SearchIcon aria-hidden="true" />
            Search
          </Button>
        </form>
      </PublicHero>

      <div className="container-page max-w-4xl">
        <PublicSection>
          <div aria-live="polite">
            {!q ? (
              <EmptyState
                icon={<SearchIcon />}
                titleAs="h2"
                title="What are you looking for?"
                description="Search across jobs, our services, news, events, guidance and help pages."
                primaryAction={{ label: "Browse jobs", href: "/jobs" }}
                secondaryAction={{ label: "Read the FAQs", href: "/faqs", variant: "outline" }}
              />
            ) : tooShort ? (
              <Callout tone="info" title="Type a little more">
                Enter at least two characters to search.
              </Callout>
            ) : limited ? (
              <Callout tone="warning" title="Too many searches">
                You have searched many times in a short period. Please wait a minute and try again.
              </Callout>
            ) : !hasResults ? (
              <EmptyState
                icon={<SearchIcon />}
                titleAs="h2"
                title={`No results for “${q}”`}
                description="Try different or fewer words, check the spelling, or browse the sections below."
                primaryAction={{ label: "Browse jobs", href: "/jobs" }}
                secondaryAction={{ label: "Contact us", href: "/contact", variant: "outline" }}
              />
            ) : (
              <div className="space-y-12">
                {jobs?.items.length ? (
                  <section aria-labelledby="search-jobs-title">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                      <h2 id="search-jobs-title" className="flex items-center gap-2 font-heading text-2xl font-semibold text-navy">
                        <Briefcase className="size-5 text-teal" aria-hidden="true" />
                        Jobs
                        <span className="text-base font-normal text-muted-foreground">({jobs.total.toLocaleString("en-IN")})</span>
                      </h2>
                      {jobs.total > jobs.items.length ? (
                        <Link href={`/jobs?q=${encodeURIComponent(q)}`} className="text-sm font-semibold text-teal-strong hover:underline">
                          See all matching jobs
                        </Link>
                      ) : null}
                    </div>
                    <CompanyJobs jobs={jobs.items} timeZone={siteTimeZone()} />
                  </section>
                ) : null}
                {content.length ? (
                  <section aria-labelledby="search-content-title">
                    <h2 id="search-content-title" className="mb-4 flex items-center gap-2 font-heading text-2xl font-semibold text-navy">
                      <FileText className="size-5 text-teal" aria-hidden="true" />
                      Pages and articles
                      <span className="text-base font-normal text-muted-foreground">({content.length})</span>
                    </h2>
                    <ol className="divide-y divide-border rounded-xl border border-border/80 bg-card">
                      {content.map((r) => (
                        <li key={`${r.collection}:${r.slug}`} className="relative p-5 focus-within:bg-surface-subtle hover:bg-surface-subtle">
                          <p className="text-xs font-semibold text-teal-strong">{COLLECTION_LABEL[r.collection] ?? "Page"}</p>
                          <h3 className="mt-0.5 font-heading text-base font-semibold text-navy">
                            <Link href={r.path} className="after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none">
                              {r.title}
                            </Link>
                          </h3>
                          {r.snippet ? <Snippet text={r.snippet} /> : r.summary ? <p className="mt-1 text-sm text-muted-foreground">{r.summary}</p> : null}
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </PublicSection>
      </div>
    </>
  );
}
