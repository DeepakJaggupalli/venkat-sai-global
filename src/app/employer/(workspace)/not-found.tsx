import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Not found inside the Employer Portal (unknown ids and records of another organisation alike, so nothing
 * reveals whether a record exists). Rendered inside the portal shell so the navigation stays available.
 */
export default function EmployerNotFound() {
  return (
    <section aria-labelledby="employer-not-found-title" className="flex flex-col items-center py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-strong">404</p>
      <h1 id="employer-not-found-title" className="mt-3 font-heading text-2xl font-bold text-navy sm:text-3xl">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">The record may have been removed, or the link may be out of date or belong to another organisation.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/employer">Go to your dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/employer/jobs">View your jobs</Link>
        </Button>
      </div>
    </section>
  );
}
