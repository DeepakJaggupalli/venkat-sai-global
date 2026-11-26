"use client";

import { ArrowRight, ChevronDown, MessageCircleQuestion, Search, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { matchesHelpQuery, normalizeHelpQuery } from "./help-search";

export type HelpBrowserSection = {
  id: string;
  topic: string;
  summary: string;
  icon: ReactNode;
  steps: readonly string[];
  links: readonly { label: string; href: string }[];
  faqs: readonly { question: string; answer: string }[];
};

export type HelpBrowserProps = {
  sections: readonly HelpBrowserSection[];
  faqs: readonly { question: string; answer: string }[];
  /** Example word for the search placeholder ("invoice"). */
  searchExample?: string;
};

/**
 * Client part of the portal help page: a filter box (kept in ?q= so a filtered view can be shared), a table of
 * contents, the sections with numbered steps and links, and the FAQs. Everything is in the server HTML, so the
 * guide reads fine before (or without) JavaScript; the filter only hides what does not match.
 * Uses useSearchParams: render it from a dynamic (signed-in) page, or inside <Suspense>.
 */
export function HelpBrowser({ sections, faqs, searchExample = "help" }: HelpBrowserProps) {
  // Start from ?q= (a shared link to a filtered guide).
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => (searchParams.get("q") ?? "").slice(0, 80));
  const inputId = useId();
  const statusId = useId();

  function update(next: string) {
    setQuery(next);
    try {
      const url = new URL(window.location.href);
      if (next.trim()) url.searchParams.set("q", next.trim().slice(0, 80));
      else url.searchParams.delete("q");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // Ignore: the filter still works, it is just not kept in the address.
    }
  }

  const terms = useMemo(() => normalizeHelpQuery(query), [query]);
  const visibleSections = useMemo(() => sections.filter((s) => matchesHelpQuery(terms, [s.topic, s.summary, ...s.steps, ...s.links.map((l) => l.label), ...s.faqs.flatMap((f) => [f.question, f.answer])])), [sections, terms]);
  const visibleFaqs = useMemo(() => faqs.filter((f) => matchesHelpQuery(terms, [f.question, f.answer])), [faqs, terms]);
  const filtering = terms.length > 0;
  const nothing = filtering && visibleSections.length === 0 && visibleFaqs.length === 0;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:w-72 lg:shrink-0">
        <div className="rounded-[22px] border border-border bg-white p-4 shadow-card lg:max-h-[calc(100dvh-7.5rem)] lg:overflow-y-auto lg:overscroll-contain">
          <label htmlFor={inputId} className="text-sm font-semibold text-foreground">
            Search this guide
          </label>
          <div className="relative mt-2">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id={inputId}
              type="search"
              value={query}
              onChange={(e) => update(e.target.value)}
              placeholder={`For example: ${searchExample}…`}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              maxLength={80}
              aria-describedby={statusId}
              className="h-12 w-full rounded-full border border-border bg-white pr-11 pl-10 text-base text-foreground placeholder:text-muted-foreground/80 focus-visible:border-accent-fill focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent-fill/40 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => update("")}
                aria-label="Clear the search"
                className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </div>
          <p id={statusId} aria-live="polite" className="mt-2 min-h-5 text-xs text-muted-foreground">
            {filtering ? (nothing ? "Nothing matches. Try another word." : `${visibleSections.length} ${visibleSections.length === 1 ? "topic" : "topics"} and ${visibleFaqs.length} ${visibleFaqs.length === 1 ? "question" : "questions"} match.`) : `${sections.length} topics`}
          </p>

          <nav aria-label="Topics in this guide" className="mt-3 border-t border-border pt-3">
            <ul className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin] lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
              {visibleSections.map((s) => (
                <li key={s.id} className="shrink-0 lg:shrink">
                  <a
                    href={`#${s.id}`}
                    className="flex min-h-11 items-center gap-2 rounded-full border border-border px-3.5 text-sm font-medium whitespace-nowrap text-foreground hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring lg:min-h-10 lg:rounded-xl lg:border-0 lg:px-2.5 lg:whitespace-normal"
                  >
                    <span aria-hidden="true" className="hidden text-accent-text lg:inline-flex [&_svg]:size-4">
                      {s.icon}
                    </span>
                    {s.topic}
                  </a>
                </li>
              ))}
              {visibleFaqs.length > 0 ? (
                <li className="shrink-0 lg:shrink">
                  <a
                    href="#questions"
                    className="flex min-h-11 items-center gap-2 rounded-full border border-border px-3.5 text-sm font-medium whitespace-nowrap text-foreground hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring lg:min-h-10 lg:rounded-xl lg:border-0 lg:px-2.5"
                  >
                    <MessageCircleQuestion aria-hidden="true" className="hidden size-4 text-accent-text lg:inline-flex" />
                    Common questions
                  </a>
                </li>
              ) : null}
            </ul>
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        {nothing ? (
          <div className="rounded-[22px] border border-dashed border-border bg-surface-subtle/70 px-5 py-10 text-center">
            <p className="font-heading text-base font-bold text-foreground">No topic matches “{query.trim()}”</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a shorter word, or ask us below.</p>
            <button
              type="button"
              onClick={() => update("")}
              className="mt-4 inline-flex min-h-11 items-center rounded-full border border-border bg-white px-5 text-[15px] font-semibold text-foreground hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Show the whole guide
            </button>
          </div>
        ) : null}

        {visibleSections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24 rounded-[22px] border border-border bg-white p-4 shadow-card sm:p-6">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text [&_svg]:size-5">
                {s.icon}
              </span>
              <div className="min-w-0">
                <h2 id={`${s.id}-title`} className="font-heading text-lg leading-snug font-bold text-foreground sm:text-xl">
                  {s.topic}
                </h2>
                <p className="mt-0.5 text-sm text-pretty text-muted-foreground sm:text-[15px]">{s.summary}</p>
              </div>
            </div>
            <ol className="mt-4 space-y-2.5">
              {s.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-white tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 text-[15px] leading-relaxed text-pretty text-foreground/90">{step}</span>
                </li>
              ))}
            </ol>
            {s.links.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {s.links.map((link) => (
                  <Link
                    key={link.href + link.label}
                    href={link.href}
                    className="group/hl inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {link.label}
                    <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform duration-150 group-hover/hl:translate-x-0.5 group-hover/hl:text-foreground motion-reduce:transition-none" />
                  </Link>
                ))}
              </div>
            ) : null}
            {s.faqs.length > 0 ? <FaqList faqs={s.faqs} className="mt-5" /> : null}
          </section>
        ))}

        {visibleFaqs.length > 0 ? (
          <section id="questions" aria-labelledby="questions-title" className="scroll-mt-24 rounded-[22px] border border-border bg-white p-4 shadow-card sm:p-6">
            <h2 id="questions-title" className="font-heading text-lg font-bold text-foreground sm:text-xl">
              Common questions
            </h2>
            <FaqList faqs={visibleFaqs} className="mt-3" />
          </section>
        ) : null}
      </div>
    </div>
  );
}

function FaqList({ faqs, className }: { faqs: readonly { question: string; answer: string }[]; className?: string }) {
  return (
    <div className={cn("divide-y divide-border rounded-2xl border border-border", className)}>
      {faqs.map((f) => (
        <details key={f.question} className="group/faq">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[15px] font-semibold text-foreground hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 text-pretty">{f.question}</span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open/faq:rotate-180 motion-reduce:transition-none" />
          </summary>
          <p className="px-4 pb-4 text-[15px] leading-relaxed text-pretty text-muted-foreground">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}
