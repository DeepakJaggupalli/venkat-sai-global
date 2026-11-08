import { Eye } from "lucide-react";
import type { ReactNode } from "react";

import { PageBreadcrumbs, type BreadcrumbEntry } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";

/**
 * Title band for public content pages, white like every hero: breadcrumbs (Home first), an accent label, the h1 in
 * the display face, a grey description, meta and actions. Shared by the content, trust, support and legal pages.
 */
export function PublicHero({
  title,
  description,
  eyebrow,
  breadcrumbs,
  meta,
  actions,
  children,
  className,
  lang,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  /** Crumbs after "Home"; the last one is the current page (no href). */
  breadcrumbs?: BreadcrumbEntry[];
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  lang?: string;
}) {
  const crumbs: BreadcrumbEntry[] | null = breadcrumbs?.length ? [{ label: "Home", href: "/" }, ...breadcrumbs] : null;
  return (
    <section lang={lang} className={cn("border-b border-border bg-white", className)}>
      <div className="container-page pt-10 pb-12 sm:pt-12 sm:pb-16 lg:pb-20">
        {crumbs ? <PageBreadcrumbs items={crumbs} className="mb-8" /> : null}
        {eyebrow ? <p className="label-dot">{eyebrow}</p> : null}
        <h1 className="mt-4 max-w-4xl font-display text-[2.5rem] text-balance text-foreground sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        {description ? <div className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{description}</div> : null}
        {meta ? <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">{meta}</div> : null}
        {actions ? <div className="mt-8 flex flex-wrap gap-3">{actions}</div> : null}
        {children}
      </div>
    </section>
  );
}

/** Notice shown above a page rendered from a CMS preview token. */
export function PreviewRibbon({ preview }: { preview: boolean }) {
  if (!preview) return null;
  return (
    <div role="status" className="border-b border-warning/40 bg-warning-soft text-warning-strong">
      <div className="container-page flex items-start gap-2 py-2.5 text-sm font-medium">
        <Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>Preview: you are viewing an unpublished version of this page. It is not visible to the public and is not indexed.</p>
      </div>
    </div>
  );
}

/** A labelled page section inside the container. */
export function PublicSection({
  title,
  description,
  id,
  children,
  className,
  action,
  headingLevel = "h2",
}: {
  title?: ReactNode;
  description?: ReactNode;
  id?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={title ? headingId : undefined} className={cn("py-10 sm:py-14", className)}>
      {title ? (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <Heading id={headingId} className="font-display text-[1.75rem] text-foreground sm:text-[2.125rem]">
              {title}
            </Heading>
            {description ? <p className="mt-2 text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Small icon + text item for hero / card meta rows. */
export function MetaItem({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {icon ? <span className="text-muted-foreground [&_svg]:size-4" aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}
