"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * "Download full backup" as a plain link (the route sends the file as an attachment, so the page stays). Building the
 * workbook takes a few seconds on a large backup, so after a tap the button says so for a short while instead of
 * looking dead; tapping again in that time does nothing (the route is rate limited too).
 */
export function DownloadBackupButton({ href }: { href: string }) {
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (!preparing) return;
    const timer = setTimeout(() => setPreparing(false), 12_000);
    return () => clearTimeout(timer);
  }, [preparing]);

  return (
    <div className="space-y-2">
      <Button asChild size="lg" className="h-12 w-full rounded-full px-6 text-base sm:w-auto">
        <a
          href={href}
          rel="nofollow"
          data-testid="download-backup"
          aria-disabled={preparing || undefined}
          onClick={(event) => {
            if (preparing) {
              event.preventDefault();
              return;
            }
            setPreparing(true);
          }}
        >
          <Download aria-hidden="true" />
          {preparing ? "Preparing the file…" : "Download full backup (Excel)"}
        </a>
      </Button>
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {preparing ? "The download starts in a few seconds. Keep this page open." : ""}
      </p>
    </div>
  );
}
