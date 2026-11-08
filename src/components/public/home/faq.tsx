import { SafeHtml } from "@/components/shared/safe-html";
import type { PublishedEntry } from "@/modules/content/types";

import { FaqSummary } from "../blocks";
import { CtaLink } from "../cta-link";
import { Section, SectionHeading, type SectionTone } from "../section";

/** Homepage FAQ: published CMS questions as an accordion (details/summary). Renders nothing without questions. */
export function HomeFaqSection({ tone = "white", faqs }: { faqs: readonly PublishedEntry<"faqs">[] } & { tone?: SectionTone }) {
  const list = faqs.filter((f) => f.title?.trim() && f.data.answer);
  if (!list.length) return null;
  return (
    <Section tone={tone} labelledBy="home-faq-title" data-testid="home-faq">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div>
          <SectionHeading id="home-faq-title" eyebrow="Questions" title="Good to know" intro="Straight answers about applying, training and travel." />
          <div className="mt-8">
            <CtaLink href="/faqs" cta="all_faqs" location="home_faq" variant="outline" arrow>
              All questions
            </CtaLink>
          </div>
        </div>
        <div className="divide-y divide-border self-start border-y border-border">
          {list.map((f) => (
            <details key={f.id} className="group">
              <FaqSummary>{f.title}</FaqSummary>
              <SafeHtml html={f.data.answer} className="max-w-2xl pb-6 text-[15px]" />
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
