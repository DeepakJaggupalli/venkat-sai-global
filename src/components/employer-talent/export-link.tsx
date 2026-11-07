"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { track } from "@/modules/analytics/client";

/** Download link for a CSV report (records a file_download event without personal data). */
export function ExportLink({ href, label, report }: { href: string; label: string; report: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} download onClick={() => track("file_download", { file: "employer_report_csv", report })}>
        <Download aria-hidden className="size-4" />
        {label}
      </a>
    </Button>
  );
}
