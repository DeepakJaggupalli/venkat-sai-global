import { redirect } from "next/navigation";

import { requireStaff } from "@/modules/identity/authz";

/** /admin/notifications/templates (referenced by the notifications module docs) → the template catalogue. */
export default async function TemplatesIndexPage() {
  await requireStaff("notifications.templates");
  redirect("/admin/notifications");
}
