import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main-content" className="container-page flex min-h-[70dvh] flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-strong">404</p>
      <h1 className="mt-3 text-3xl font-bold text-navy sm:text-4xl">We couldn&apos;t find that page</h1>
      <p className="mt-3 max-w-md text-muted-foreground">The page may have moved, or the link may be out of date.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/">Go to homepage</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/jobs">Explore opportunities</Link>
        </Button>
      </div>
    </main>
  );
}
