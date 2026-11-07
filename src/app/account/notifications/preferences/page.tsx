import type { Metadata } from "next";

import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/modules/identity/session";
import { getPreferenceMatrix } from "@/modules/notifications/queries";

import { NotificationSectionTabs } from "../_components/section-tabs";

export const metadata: Metadata = { title: "Notification preferences", robots: { index: false, follow: false } };

/**
 * /account/notifications/preferences — category × channel preferences for every signed-in user (linked from
 * every notification email footer). Mandatory account, security and transaction messages stay on.
 */
export default async function NotificationPreferencesPage() {
  const user = await requireUser();
  const matrix = await getPreferenceMatrix(user.id);

  return (
    <div className="space-y-6">
      <PageHeader title="Notification preferences" description="Choose which updates you receive and how." className="pb-0" />
      <NotificationSectionTabs active="preferences" />
      <NotificationPreferencesForm matrix={matrix} />
    </div>
  );
}
