import { ChevronDown, CircleHelp, LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { LinkTabs } from "@/components/shared/link-tabs";
import { FAQ_AUDIENCE_OPTIONS } from "@/modules/content/collections";
import { getPublishedEntries, resolvePreviewTarget } from "@/modules/content/queries";
import type { PublishedEntry } from "@/modules/content/types";

import { Prose } from "../news/_components/article-parts";
import { JsonLd } from "../news/_components/json-ld";
import { PreviewRibbon, PublicHero, PublicSection } from "../news/_components/public-hero";
import { emptyEntryPage, listingMetadata, loadEntry, readPreview, safeLoad, type PageSearchParams } from "../news/_lib/cms";
import { headingId, pickParam, plainText } from "../news/_lib/text";

const AUDIENCE_VALUES = FAQ_AUDIENCE_OPTIONS.map((o) => o.value);
const AUDIENCE_LABEL: Record<string, string> = Object.fromEntries(FAQ_AUDIENCE_OPTIONS.map((o) => [o.value, o.label]));

type FaqGroup = { key: string; title: string; topics: { topic: string | null; items: PublishedEntry<"faqs">[] }[] };

/** Group FAQs by audience (in the configured order), then by topic (first appearance order, untitled last). */
function groupFaqs(items: PublishedEntry<"faqs">[]): FaqGroup[] {
  const groups: FaqGroup[] = [];
  for (const audience of AUDIENCE_VALUES) {
    const inAudience = items.filter((e) => e.data.audience === audience);
    if (!inAudience.length) continue;
    const topics = new Map<string, PublishedEntry<"faqs">[]>();
    for (const e of inAudience) {
      const key = e.data.topic?.trim() || "";
      topics.set(key, [...(topics.get(key) ?? []), e]);
    }
    const ordered = [...topics.entries()].sort(([a], [b]) => Number(a === "") - Number(b === ""));
    groups.push({ key: audience, title: AUDIENCE_LABEL[audience] ?? audience, topics: ordered.map(([topic, list]) => ({ topic: topic || null, items: list })) });
  }
  return groups;
}

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const audience = pickParam(sp.audience, AUDIENCE_VALUES);
  return listingMetadata(
    audience ? `FAQs for ${AUDIENCE_LABEL[audience]?.toLowerCase()}` : "Frequently asked questions",
    "Answers to common questions from candidates, employers, recruitment partners and institutions.",
    "/faqs",
    { noindex: Boolean(audience) || Boolean(readPreview(sp)) },
  );
}

export default async function FaqsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = await searchParams;
  const audience = pickParam(sp.audience, AUDIENCE_VALUES);
  const result = await safeLoad("faqs", () => getPublishedEntries("faqs", { category: audience, limit: 100 }), emptyEntryPage<"faqs">(100));
  // CMS preview links for an FAQ point at /faqs?preview=<token>: show that (possibly unpublished) answer in place.
  const previewToken = readPreview(sp);
  const target = previewToken ? await safeLoad("faqs.preview", () => resolvePreviewTarget(previewToken), null) : null;
  const previewDetail = target?.collection === "faqs" ? await safeLoad("faqs.previewEntry", () => loadEntry("faqs", target.slug, previewToken), null) : null;
  const previewEntry = previewDetail?.entry ?? null;
  const items = previewEntry ? [previewEntry, ...result.items.filter((e) => e.id !== previewEntry.id)] : result.items;
  const groups = groupFaqs(items);
  const used = new Set<string>();

  return (
    <>
      <PreviewRibbon preview={Boolean(previewDetail?.preview)} />
      {result.items.length && !previewDetail?.preview ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: result.items.map((e) => ({ "@type": "Question", name: e.title, acceptedAnswer: { "@type": "Answer", text: plainText(e.data.answer) } })),
          }}
        />
      ) : null}
      <PublicHero
        eyebrow="Help"
        title="Frequently asked questions"
        description="Answers to the questions we hear most often. If you cannot find what you need, our support team can help."
        breadcrumbs={[{ label: "FAQs" }]}
      />
      <div className="container-page max-w-4xl">
        <PublicSection>
          <LinkTabs
            label="Questions for"
            className="mb-8"
            items={[{ href: "/faqs", label: "Everyone" }, ...FAQ_AUDIENCE_OPTIONS.map((o) => ({ href: `/faqs?audience=${o.value}`, label: o.label }))]}
            activeHref={audience ? `/faqs?audience=${audience}` : "/faqs"}
          />
          {groups.length ? (
            <div className="space-y-12">
              {groups.map((group) => {
                const groupId = headingId(group.title, used);
                return (
                  <section key={group.key} aria-labelledby={groupId}>
                    <h2 id={groupId} className="font-heading text-2xl font-semibold text-navy">
                      {group.title}
                    </h2>
                    {group.topics.map((topic) => (
                      <div key={topic.topic ?? "general"} className="mt-6">
                        {topic.topic ? <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{topic.topic}</h3> : null}
                        <div className="divide-y divide-border rounded-xl border border-border/80 bg-card">
                          {topic.items.map((faq) => (
                            <details key={faq.id} id={`faq-${faq.slug}`} open={faq.id === previewEntry?.id || undefined} className="group scroll-mt-24">
                              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4 font-medium text-navy hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                                <span>{faq.title}</span>
                                <ChevronDown className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                              </summary>
                              <div className="px-5 pb-5">
                                <Prose html={faq.data.answer} className="[&>*:first-child]:mt-0" />
                              </div>
                            </details>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<CircleHelp />}
              titleAs="h2"
              title={audience ? `No questions for ${AUDIENCE_LABEL[audience]?.toLowerCase()} yet` : "No questions published yet"}
              description="Our team is preparing answers to common questions. In the meantime, contact us and we will help directly."
              primaryAction={{ label: "Contact us", href: "/contact" }}
              secondaryAction={audience ? { label: "All questions", href: "/faqs", variant: "outline" } : { label: "Get support", href: "/support", variant: "outline" }}
            />
          )}
          <div className="mt-12 flex flex-col gap-4 rounded-xl border border-border/80 bg-surface-subtle p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <LifeBuoy className="mt-0.5 size-5 text-teal" aria-hidden="true" />
              <div>
                <p className="font-semibold text-navy">Still have a question?</p>
                <p className="text-sm text-muted-foreground">Our support team replies by email. Signed-in users can track requests in their portal.</p>
              </div>
            </div>
            <div className="flex gap-4 text-sm font-semibold">
              <Link href="/support" className="text-teal-strong hover:underline">
                Get support
              </Link>
              <Link href="/contact" className="text-teal-strong hover:underline">
                Contact us
              </Link>
            </div>
          </div>
        </PublicSection>
      </div>
    </>
  );
}
