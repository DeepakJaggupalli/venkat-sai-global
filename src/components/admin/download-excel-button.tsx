import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SearchParams } from "@/lib/http";

/**
 * "Download Excel" for a list page: links to the list's export route handler with the page's current filters
 * (pagination dropped). The route authorises, masks, caps the rows and logs the export.
 */
export function DownloadExcelButton({
  href,
  searchParams,
  keys,
  label = "Download Excel",
  variant = "outline",
}: {
  /** Export route, e.g. "/admin/cv-submissions/export". */
  href: string;
  searchParams?: SearchParams;
  /** Filter params to forward (all except page/pageSize when omitted). */
  keys?: readonly string[];
  label?: string;
  variant?: "outline" | "default";
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === "page" || key === "pageSize" || value === undefined) continue;
    if (keys && !keys.includes(key)) continue;
    for (const v of Array.isArray(value) ? value : [value]) if (v !== "") query.append(key, v);
  }
  const qs = query.toString();
  return (
    <Button asChild variant={variant} size="sm">
      <a href={qs ? `${href}?${qs}` : href} data-testid="download-excel" rel="nofollow">
        <FileSpreadsheet aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}
