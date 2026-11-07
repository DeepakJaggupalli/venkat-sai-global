import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main id="main-content" className="container-page flex min-h-[70dvh] flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-strong">403</p>
      <h1 className="mt-3 text-3xl font-bold text-navy sm:text-4xl">You don&apos;t have access to this page</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Your account does not have permission for this area. If you think this is a mistake, contact your administrator.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/">Go to homepage</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-in">Sign in with another account</Link>
        </Button>
      </div>
    </main>
  );
}
