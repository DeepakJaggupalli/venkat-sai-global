import { ArrowRight, LockKeyhole } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type ForbiddenViewProps = {
  /** The portal home: the main button links here. */
  homeHref: string;
  homeLabel?: string;
  /** A second, useful place, e.g. the portal's "How to use" guide. */
  secondary?: { label: string; href: string };
  description?: string;
  className?: string;
};

/**
 * Friendly "no access" screen for a member whose role does not include a page (requireOrgMember → forbidden()).
 * Put it in the portal's forbidden.tsx so it renders inside the portal shell and the member keeps the menu of
 * what their role allows. Same look as NotFoundView. Server component.
 *
 *   export default function Forbidden() { return <ForbiddenView homeHref="/recruiter" />; }
 */
export function ForbiddenView({
  homeHref,
  homeLabel = "Go to my dashboard",
  secondary,
  description = "Your role in this workspace does not include this area. Ask your workspace owner or an admin to change your role if you need it.",
  className,
}: ForbiddenViewProps) {
  return (
    <section aria-labelledby="forbidden-title" data-slot="forbidden" className={cn("mx-auto flex max-w-xl flex-col items-center px-1 py-12 text-center sm:py-16", className)}>
      <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
        <LockKeyhole className="size-7" />
      </span>
      <p className="label-dot mt-5 justify-center">No access</p>
      <h1 id="forbidden-title" className="mt-3 font-display text-[1.75rem] leading-tight text-balance text-foreground sm:text-[2.125rem]">
        You don&apos;t have access to this page
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
