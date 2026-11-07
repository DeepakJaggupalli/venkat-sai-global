import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { withParams, sp, type SearchParams } from "@/lib/http";
import { getPortalAccess } from "@/modules/identity/authz";
import { requireUser } from "@/modules/identity/session";

export const metadata: Metadata = { title: "Notifications", robots: { index: false, follow: false } };

/**
 * /notifications — shared entry point to the notification centre (links in emails and older bookmarks).
 * People who only use the People Portal go to /talent/notifications; everyone else (staff, organisation
 * members) to /account/notifications, which lists notifications from every portal. The filter is kept.
 */
export default async function NotificationsEntryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser({ returnTo: "/notifications" });
  const params = await searchParams;
  const access = await getPortalAccess(user);
  const businessUser = access.admin || access.employer || access.recruiter || access.institution;
  const target = businessUser ? "/account/notifications" : "/talent/notifications";
  redirect(withParams(target, {}, { filter: sp(params, "filter") === "unread" ? "unread" : null }));
}
