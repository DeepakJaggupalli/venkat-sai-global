"use client";

import Link from "next/link";
import { createContext, Fragment, useContext, useEffect } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

import type { BreadcrumbEntry } from "./types";

type SetTrail = (trail: BreadcrumbEntry[] | null) => void;

/** Provided by PortalShell. Holds only the (stable) setter so registrations never loop. */
export const BreadcrumbTrailContext = createContext<SetTrail | null>(null);

/**
 * Put this page's breadcrumb in the portal top bar. The portal home crumb is added automatically,
 * so start from the first level below it; omit `href` on the last item (the current page).
 *
 *   <PortalBreadcrumb items={[{ label: "Jobs", href: "/employer/jobs" }, { label: job.title }]} />
 *
 * Renders nothing in place. Without it the top bar derives a trail from the sidebar navigation.
 */
export function PortalBreadcrumb({ items }: { items: readonly BreadcrumbEntry[] }) {
  const setTrail = useContext(BreadcrumbTrailContext);
  // Serialise so a new array literal with the same content does not re-register on every render.
  const serialized = JSON.stringify(items.map(({ label, href }) => ({ label, href })));
  useEffect(() => {
    if (!setTrail) return;
    setTrail(JSON.parse(serialized) as BreadcrumbEntry[]);
    return () => setTrail(null);
  }, [setTrail, serialized]);
  return null;
}

/** Breadcrumb row rendered in the top bar. Entries with `href` are links; the rest is the current page. */
export function ShellBreadcrumbs({
  entries,
  label,
  className,
}: {
  entries: readonly BreadcrumbEntry[];
  label: string;
  className?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <Breadcrumb aria-label={label} className={cn("min-w-0", className)}>
      <BreadcrumbList className="flex-nowrap gap-1.5 text-[13px]">
        {entries.map((entry, index) => {
          const last = index === entries.length - 1;
          return (
            <Fragment key={`${index}:${entry.label}`}>
              {index > 0 && <BreadcrumbSeparator className="text-border [&>svg]:text-muted-foreground/60" />}
              <BreadcrumbItem className={cn("min-w-0", last ? "shrink" : "max-w-[14rem] shrink-0")}>
                {entry.href ? (
                  <BreadcrumbLink asChild className="truncate rounded-sm hover:text-navy">
                    <Link href={entry.href}>{entry.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate font-medium text-navy">{entry.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
