import { ArrowRight } from "lucide-react";
import Link from "next/link";

/**
 * Not-found screen for a missing record on the public website (an unknown booking code, requirement, service and so
 * on): `notFound()` from any public page lands here, inside the site header and footer. The public layout already
 * renders `<main id="main-content">` and the logo, so this is a plain section (the root not-found.tsx, used for
 * unknown URLs, is a standalone page with its own `<main>`).
 */
export default function PublicNotFound() {
  return (
    <section aria-labelledby="not-found-title" className="container-page flex flex-col items-center py-24 text-center sm:py-32">
      <p className="label-dot justify-center">Error 404</p>
      <h1 id="not-found-title" className="mt-5 max-w-3xl text-balance font-display text-[2.75rem] text-foreground sm:text-6xl">
        This page is not here
      </h1>
      <p className="mt-5 max-w-md text-lg text-muted-foreground">It may have moved, or the link may be out of date.</p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-foreground px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#26262b] focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Go to the homepage
          <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
        <Link
          href="/requirements"
          className="inline-flex min-h-12 items-center rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          See latest requirements
        </Link>
        <Link
          href="/search"
          className="inline-flex min-h-12 items-center rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Search the site
        </Link>
      </div>
    </section>
  );
}
