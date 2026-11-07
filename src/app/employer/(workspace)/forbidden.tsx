import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * A member without the permission a page needs (requireOrgMember → forbidden()). Rendered inside the portal
 * shell so the member can carry on with the parts of the workspace their role allows.
 */
export default function EmployerForbidden() {
  return (
    <section aria-labelledby="employer-forbidden-title" className="flex flex-col items-center py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-strong">403</p>
      <h1 id="employer-forbidden-title" className="mt-3 font-heading text-2xl font-bold text-navy sm:text-3xl">
        You don&apos;t have access to this page
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Your role in this workspace does not include this area. Ask the workspace owner or an admin to change your role if you need it.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/employer">Go to your dashboard</Link>
        </Button>
      </div>
    </section>
  );
}
