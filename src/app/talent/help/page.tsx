import type { Metadata } from "next";

import { PortalHelpPage } from "@/components/help/portal-help-page";
import { requireUser } from "@/modules/identity/session";

export const metadata: Metadata = { title: "How to use" };

/**
 * People Portal guide. Any signed-in person may read it (no candidate data is shown), so it does not send
 * people through onboarding first.
 */
export default async function TalentHelpPage() {
  await requireUser();
  return <PortalHelpPage portal="talent" permissions={null} />;
}
