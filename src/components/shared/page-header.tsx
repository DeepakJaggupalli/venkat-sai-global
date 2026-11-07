import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

import { renderActionSlot } from "./action-link";
import type { ActionSlot } from "./types";

export type BreadcrumbEntry = { label: string; href?: string };

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Trail from the portal root to the current page. The last entry is the current page (no href needed). */
  breadcrumbs?: BreadcrumbEntry[];
  /** A single "back" link, shown above the title (use instead of, or with, breadcrumbs on detail pages). */
  backLink?: { href: string; label: string };
  /** Status shown next to the title, e.g. <StatusBadge status={job.status} domain="job" />. */
  status?: ReactNode;
  /** Small line above the title (e.g. a record code such as "JOB-000123"). */
  eyebrow?: ReactNode;
  /** Meta row under the description (dates, owner, location). */
  meta?: ReactNode;
  /** Primary/secondary actions: link actions or custom elements (client buttons, dialogs). */
  actions?: ActionSlot | ActionSlot[];
  /** Heading level — h1 for pages, h2 when the header sits inside another page section. */
  as?: "h1" | "h2";
  className?: string;
};

/**
 * Page title block used at the top of every portal page.
 *
 *   <PageHeader
 *     title="Jobs"
 *     description="Create, publish and track your job postings."
 *     breadcrumbs={[{ label: "Employer", href: "/employer" }, { label: "Jobs" }]}
 *     actions={[{ label: "Post a job", href: "/employer/jobs/new" }]}
 *   />
 */
export function PageHeader({ title, description, breadcrumbs, backLink, status, eyebrow, meta, actions, as: Heading = "h1", className }: PageHeaderProps) {
  const actionList = Array.isArray(actions) ? actions : actions !== undefined ? [actions] : [];
  return (
    <header data-slot="page-header" className={cn("flex flex-col gap-3 pb-6", className)}>
      {backLink ? (
        <Link
          href={backLink.href}
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {backLink.label}
        </Link>
      ) : null}
      {breadcrumbs && breadcrumbs.length > 0 ? <PageBreadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          {eyebrow ? <div className="text-xs font-semibold tracking-wide text-teal-strong uppercase">{eyebrow}</div> : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Heading className="font-heading text-2xl font-semibold tracking-tight text-balance text-navy sm:text-[1.75rem] sm:leading-tight">
              {title}
            </Heading>
            {status ? <div className="flex flex-wrap items-center gap-2">{status}</div> : null}
          </div>
          {description ? <div className="max-w-3xl text-sm text-pretty text-muted-foreground sm:text-[0.9375rem]">{description}</div> : null}
          {meta ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm text-muted-foreground">{meta}</div> : null}
        </div>
        {actionList.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            {actionList.map((slot, i) => (
              <Fragment key={i}>{renderActionSlot(slot, { variant: i === 0 ? "default" : "outline" })}</Fragment>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** Breadcrumb trail; on small screens only the parent and current page are shown to avoid wrapping. */
export function PageBreadcrumbs({ items, className }: { items: BreadcrumbEntry[]; className?: string }) {
  const lastIndex = items.length - 1;
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {items.map((item, i) => {
          const isLast = i === lastIndex;
          const hideOnMobile = i < lastIndex - 1;
          return (
            <Fragment key={`${item.label}-${i}`}>
              <BreadcrumbItem className={cn(hideOnMobile && "hidden sm:inline-flex")}>
                {isLast ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : item.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <span>{item.label}</span>
                )}
              </BreadcrumbItem>
              {!isLast ? <BreadcrumbSeparator className={cn(hideOnMobile && "hidden sm:block")} /> : null}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
