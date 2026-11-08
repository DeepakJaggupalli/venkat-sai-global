import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main id="main-content" className="container-page flex min-h-dvh flex-col items-center justify-center py-16 text-center">
      <Link href="/" className="mb-14 rounded-md">
        <Logo decorative className="h-8 w-auto" />
        <span className="sr-only">Venkat Sai Global home</span>
      </Link>
      <p className="label-dot justify-center">Error 404</p>
      <h1 className="mt-5 max-w-3xl text-balance font-display text-[2.75rem] text-foreground sm:text-6xl lg:text-7xl">This page is not here</h1>
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
          href="/jobs"
          className="inline-flex min-h-12 items-center rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-foreground transition-colors hover:border-[#c9cdd5] hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Explore jobs
        </Link>
      </div>
    </main>
  );
}
