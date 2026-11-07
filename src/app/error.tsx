"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="container-page flex min-h-[60dvh] flex-col items-center justify-center py-16 text-center">
      <h1 className="text-2xl font-bold text-navy sm:text-3xl">Something went wrong</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        An unexpected error occurred. Please try again. If the problem continues, contact support
        {error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <Button className="mt-8" onClick={() => reset()}>
        Try again
      </Button>
    </main>
  );
}
