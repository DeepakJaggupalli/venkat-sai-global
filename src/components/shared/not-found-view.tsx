import { ArrowRight, SearchX } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type NotFoundViewProps = {
  /** The portal (or area) home: "Go to my dashboard" links here. */
  homeHref: string;
  homeLabel?: string;
  /** A second, useful place ("View your jobs"). */
  secondary?: { label: string; href: string };
  title?: string;
  description?: string;
  /** Small label above the heading. Default "Page not found"; null hides it (translated pages). */
  eyebrow?: string | null;
  className?: string;
};

/**
 * Friendly "not found" inside a portal: unknown ids, records of another organisation and mistyped links all get
 * the same screen, so nothing reveals whether a record exists. Rendered inside the portal shell, so the menu
 * stays available. Server component.
 *
 *   export default function NotFound() { return <NotFoundView homeHref="/recruiter" secondary={{ label: "Submissions", href: "/recruiter/submissions" }} />; }
 */
export function NotFoundView({
  homeHref,
  homeLabel = "Go to my dashboard",
  secondary,
  title = "We couldn't find that page",
  description = "The link may be old or mistyped, or the record may have been removed or belong to another account.",
  eyebrow = "Page not found",
  className,
}: NotFoundViewProps) {
  return (
    <section aria-labelledby="not-found-title" data-slot="not-found" className={cn("mx-auto flex max-w-xl flex-col items-center px-1 py-12 text-center sm:py-16", className)}>
      <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
        <SearchX className="size-7" />
      </span>
      {eyebrow ? <p className="label-dot mt-5 justify-center">{eyebrow}</p> : null}
      <h1 id="not-found-title" className={cn(eyebrow ? "mt-3" : "mt-5", "font-display text-[1.75rem] leading-tight text-balance text-foreground sm:text-[2.125rem]")}>
        {title}
      </h1>
      <p className="mt-3 max-w-md text-[15px] text-pretty text-muted-foreground sm:text-base">{description}</p>
      <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
        <Link
          href={homeHref}
          className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-[15px] font-semibold text-white transition-colors hover:bg-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {homeLabel}
          <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
        {secondary ? (
          <Link
            href={secondary.href}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
