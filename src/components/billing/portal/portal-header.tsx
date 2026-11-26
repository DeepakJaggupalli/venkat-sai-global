import { requestedEmployerPortal } from "@/components/layout/employer-portal";
import { PageHeader } from "@/components/shared/page-header";
import { LinkTabs } from "@/components/shared/link-tabs";

import { billingTabs, BILLING_PORTALS, type BillingPortal } from "../portal-config";

/**
 * Page header + tabs shared by every portal billing page. The employer workspace also serves the Travel Agency
 * Portal (/agency), so the breadcrumb names the portal the member is actually in.
 */
export async function PortalBillingHeader({ portal, title, description }: { portal: BillingPortal; title: string; description: string }) {
  const cfg = BILLING_PORTALS[portal];
  const agency = portal === "employer" && (await requestedEmployerPortal()) === "agency";
  const home = agency ? { label: "Travel Agency Portal", href: "/agency" } : { label: cfg.homeLabel, href: cfg.home };
  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} breadcrumbs={[home, { label: "Billing" }]} />
      <LinkTabs items={billingTabs(portal)} label="Billing sections" />
    </div>
  );
}
