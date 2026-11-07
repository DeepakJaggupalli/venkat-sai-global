import { ListTree } from "lucide-react";
import type { ReactNode } from "react";

import { SafeHtml } from "@/components/shared/safe-html";
import { cn } from "@/lib/utils";

import type { HeadingAnchor } from "../_lib/text";

/** Long-form CMS body (sanitised on write) in the shared rich-text typography, at a readable measure. */
export function Prose({ html, className }: { html: string | null | undefined; className?: string }) {
  if (!html) return null;
  return <SafeHtml html={html} className={cn("max-w-[72ch] text-base leading-7 [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24", className)} />;
}

/** "On this page" navigation built from the body's h2 / h3 headings. */
export function TableOfContents({ headings, title = "On this page", className }: { headings: HeadingAnchor[]; title?: string; className?: string }) {
  if (headings.length < 2) return null;
  return (
    <nav aria-labelledby="toc-title" className={cn("rounded-xl border border-border/80 bg-card p-5", className)}>
      <p id="toc-title" className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy">
        <ListTree className="size-4" aria-hidden="true" />
        {title}
      </p>
      <ol className="space-y-1.5 text-sm">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? "pl-4" : undefined}>
            <a href={`#${h.id}`} className="block rounded-sm text-muted-foreground underline-offset-4 hover:text-navy hover:underline focus-visible:outline-2 focus-visible:outline-ring">
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Two-column article layout: main content with an optional sticky aside on large screens. */
export function ArticleLayout({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn("container-page grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_18rem]", className)}>
      <div className="min-w-0">{children}</div>
      {aside ? <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">{aside}</aside> : null}
    </div>
  );
}

/** Small labelled fact box for asides (date, author, venue…). */
export function FactBox({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("rounded-xl border border-border/80 bg-card p-5 text-sm", className)}>
      <h2 className="mb-3 font-heading text-base font-semibold text-navy">{title}</h2>
      {children}
    </section>
  );
}
