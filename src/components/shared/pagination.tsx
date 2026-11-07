import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Pagination as PaginationRoot, PaginationContent, PaginationEllipsis, PaginationItem } from "@/components/ui/pagination";
import { formatNumber } from "@/lib/format";
import { withParams, type SearchParams } from "@/lib/http";
import { cn } from "@/lib/utils";

import { pageRange, pageWindow } from "./pagination-utils";

type PaginationProps = {
  page: number;
  pageCount: number;
  /** The current route path (e.g. "/employer/jobs"). */
  pathname: string;
  /** The page's `searchParams` (awaited) — filters and sorting are preserved in every link. */
  searchParams?: SearchParams;
  /** Total number of rows, for the "Showing 21–40 of 132" summary. */
  total?: number;
  pageSize?: number;
  /** Plural noun for the summary, e.g. "applications". */
  itemLabel?: string;
  /** Search param holding the page number. */
  param?: string;
  /** Accessible name when a page has more than one paginated list. */
  label?: string;
  labels?: { previous?: string; next?: string; page?: (page: number, pageCount: number) => string };
  className?: string;
};

/**
 * Link-based pagination for server-rendered lists (works without JavaScript).
 * Pair with `parsePage()` / `paginated()` from src/lib/http.ts.
 *
 *   <Pagination pathname="/employer/jobs" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="jobs" />
 */
export function Pagination({
  page,
  pageCount,
  pathname,
  searchParams,
  total,
  pageSize,
  itemLabel = "results",
  param = "page",
  label = "Pagination",
  labels,
  className,
}: PaginationProps) {
  const count = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), count);
  const hrefFor = (p: number) => withParams(pathname, searchParams, { [param]: p <= 1 ? null : p });
  const previousLabel = labels?.previous ?? "Previous";
  const nextLabel = labels?.next ?? "Next";
  const pageText = labels?.page?.(current, count) ?? `Page ${current} of ${count}`;
  const range = total !== undefined && pageSize ? pageRange(current, pageSize, total) : null;

  if (count <= 1 && !range) return null;

  return (
    <div data-slot="pagination" className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      {range ? (
        <p className="text-sm text-muted-foreground">
          {total === 0 ? (
            `No ${itemLabel}`
          ) : (
            <>
              Showing <span className="font-medium text-foreground">{formatNumber(range.from)}</span>–
              <span className="font-medium text-foreground">{formatNumber(range.to)}</span> of{" "}
              <span className="font-medium text-foreground">{formatNumber(total ?? 0)}</span> {itemLabel}
            </>
          )}
        </p>
      ) : (
        <span />
      )}
      {count > 1 ? (
        <PaginationRoot aria-label={label} className="mx-0 w-auto justify-start sm:justify-end">
          <PaginationContent className="gap-1">
            <PaginationItem>
              <StepLink href={current > 1 ? hrefFor(current - 1) : null} label={previousLabel} direction="previous" />
            </PaginationItem>
            <PaginationItem className="px-2 text-sm text-muted-foreground sm:hidden" aria-live="polite">
              {pageText}
            </PaginationItem>
            {pageWindow(current, count).map((token) =>
              typeof token === "number" ? (
                <PaginationItem key={token} className="hidden sm:list-item">
                  <Button asChild variant={token === current ? "outline" : "ghost"} size="icon" className={cn("tabular-nums", token === current && "border-teal-strong font-semibold")}>
                    <Link href={hrefFor(token)} aria-current={token === current ? "page" : undefined} aria-label={`Page ${token}`}>
                      {token}
                    </Link>
                  </Button>
                </PaginationItem>
              ) : (
                <PaginationItem key={token} className="hidden sm:list-item">
                  <PaginationEllipsis />
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <StepLink href={current < count ? hrefFor(current + 1) : null} label={nextLabel} direction="next" />
            </PaginationItem>
          </PaginationContent>
        </PaginationRoot>
      ) : null}
    </div>
  );
}

function StepLink({ href, label, direction }: { href: string | null; label: string; direction: "previous" | "next" }) {
  const icon = direction === "previous" ? <ChevronLeft aria-hidden="true" data-icon="inline-start" /> : <ChevronRight aria-hidden="true" data-icon="inline-end" />;
  const content =
    direction === "previous" ? (
      <>
        {icon}
        <span>{label}</span>
      </>
    ) : (
      <>
        <span>{label}</span>
        {icon}
      </>
    );
  if (!href) {
    return (
      <span aria-disabled="true" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground opacity-60 [&_svg]:size-4">
        {content}
      </span>
    );
  }
  return (
    <Button asChild variant="outline">
      <Link href={href} rel={direction === "previous" ? "prev" : "next"}>
        {content}
      </Link>
    </Button>
  );
}
