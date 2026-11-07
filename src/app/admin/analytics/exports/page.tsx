import { Download } from "lucide-react";
import type { Metadata } from "next";

import { analyticsHref, describeRange } from "@/components/analytics-dashboard/format";
import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import type { SearchParams } from "@/lib/http";
import { getAnalyticsRange } from "@/modules/analytics/access";
import { requireStaff } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Analytics exports" };

const DATASETS = [
  {
    key: "daily_metrics",
    title: "Daily metrics",
    description: "Pre-aggregated daily numbers (sessions, visitors, page views, bounces, conversions) by source, device, country and page. Kept beyond raw-data retention.",
  },
  {
    key: "events",
    title: "Events",
    description: "Every recorded event with its time, name, path, non-personal properties and a random session id.",
  },
  {
    key: "sessions",
    title: "Sessions",
    description: "One row per visit: landing and exit pages, source, campaign tags, device family, country, pages viewed and duration.",
  },
] as const;

export default async function ExportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("analytics.export");
  const range = getAnalyticsRange(await searchParams);

  return (
    <AnalyticsFrame
      staff={staff}
      range={range}
      title="Exports"
      description="Download pseudonymous analytics data as CSV for the selected period. Exports contain no visitor or user ids and are recorded in the audit log."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {DATASETS.map((d) => (
          <SectionCard key={d.key} title={d.title} description={d.description}>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{describeRange(range.from, range.to)} · up to 50,000 rows</p>
              <Button asChild variant="outline">
                <a href={analyticsHref("/admin/analytics/exports/download", range, { dataset: d.key })} download>
                  <Download aria-hidden="true" />
                  Download CSV<span className="sr-only"> of {d.title.toLowerCase()}</span>
                </a>
              </Button>
            </div>
          </SectionCard>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Larger periods are cut at 50,000 rows; choose a shorter period to get the rest. Handle exported files under the privacy policy and delete them when
        you no longer need them.
      </p>
    </AnalyticsFrame>
  );
}
