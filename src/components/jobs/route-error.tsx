"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/**
 * Translated error boundary body for People Portal job routes: explains calmly, offers a retry and a
 * way back. The error digest is shown so support can find the server log; no details leak.
 */
export function JobsRouteError({ error, reset, backHref }: { error: Error & { digest?: string }; reset: () => void; backHref: string }) {
  const t = useT("talent-jobs");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-lg space-y-4 rounded-xl border bg-card p-6 text-center shadow-xs">
      <AlertTriangle aria-hidden="true" className="mx-auto size-10 text-warning-strong" />
      <h1 className="font-heading text-xl font-semibold text-navy">{t("error.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("error.body")}</p>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">{t("error.reference", { code: error.digest })}</p> : null}
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={reset}>
          {t("error.retry")}
        </Button>
        <Button asChild variant="outline">
          <Link href={backHref}>{t("error.back")}</Link>
        </Button>
      </div>
    </div>
  );
}
