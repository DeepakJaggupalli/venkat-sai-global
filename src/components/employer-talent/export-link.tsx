"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { track } from "@/modules/analytics/client";

/** Download link for a CSV or Excel report (records a file_download event without personal data). */
export function ExportLink({ href, label, report, file = "employer_report_csv" }: { href: string; label: string; report: string; file?: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} download onClick={() => track("file_download", { file, report })}>
        <Download aria-hidden className="size-4" />
        {label}
      </a>
    </Button>
  );
}
