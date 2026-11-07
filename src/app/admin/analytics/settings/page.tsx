import type { Metadata } from "next";

import { AnalyticsFrame } from "@/components/analytics-dashboard/page-frame";
import { AnalyticsSettingsForm } from "@/components/analytics-dashboard/settings-form";
import { Callout } from "@/components/shared/callout";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { getSettings, listFeatureFlags } from "@/modules/settings";

export const metadata: Metadata = { title: "Analytics settings" };

export default async function AnalyticsSettingsPage() {
  const staff = await requireStaff("analytics.view");
  const canEdit = staffCan(staff, "analytics.configure");
  const [settings, flags] = await Promise.all([
    getSettings([
      "analytics.retention_days_events",
      "analytics.retention_days_sessions",
      "analytics.retention_days_heatmaps",
      "analytics.clarity_project_id",
      "analytics.ga4_measurement_id",
    ]),
    listFeatureFlags(),
  ]);
  const flag = (key: string) => flags.find((f) => f.key === key)?.enabled ?? false;

  return (
    <AnalyticsFrame
      staff={staff}
      title="Settings"
      description="How long analytics data is kept, which optional services may load, and what visitors are told."
    >
      <Callout tone="info" title="How consent works">
        Visitors choose in the cookie banner: essential (always on), functional, analytics and session insights. First-party analytics and heatmaps need
        analytics consent; Clarity needs session-insights consent; GA4 needs analytics consent. Visitors can change their choice at any time on the
        cookie preferences page, which also lists the services enabled here.
      </Callout>
      <AnalyticsSettingsForm
        canEdit={canEdit}
        values={{
          retentionEvents: settings["analytics.retention_days_events"],
          retentionSessions: settings["analytics.retention_days_sessions"],
          retentionHeatmaps: settings["analytics.retention_days_heatmaps"],
          clarityProjectId: settings["analytics.clarity_project_id"],
          ga4MeasurementId: settings["analytics.ga4_measurement_id"],
          firstParty: flag("analytics.first_party"),
          heatmaps: flag("analytics.heatmaps"),
          clarity: flag("analytics.clarity"),
          ga4: flag("analytics.ga4"),
        }}
      />
    </AnalyticsFrame>
  );
}
