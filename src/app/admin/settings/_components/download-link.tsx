import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Plain anchor for file downloads from route handlers (a client-side <Link> navigation would not download). */
export function DownloadLink({ href, label, testId }: { href: string; label: string; testId?: string }) {
  return (
    <Button asChild variant="outline">
      <a href={href} download data-testid={testId}>
        <Download aria-hidden className="size-4" />
        {label}
      </a>
    </Button>
  );
}
