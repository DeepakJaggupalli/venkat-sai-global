import { PageHeader } from "@/components/shared/page-header";
import { LinkTabs } from "@/components/shared/link-tabs";

import { billingTabs, BILLING_PORTALS, type BillingPortal } from "../portal-config";

/** Page header + tabs shared by every portal billing page. */
export function PortalBillingHeader({ portal, title, description }: { portal: BillingPortal; title: string; description: string }) {
  const cfg = BILLING_PORTALS[portal];
  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} breadcrumbs={[{ label: cfg.homeLabel, href: cfg.home }, { label: "Billing" }]} />
      <LinkTabs items={billingTabs(portal)} label="Billing sections" />
    </div>
  );
}
