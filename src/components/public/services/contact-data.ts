import "server-only";

import { resolveContact, type ResolvedContact } from "@/components/public/contact-links";
import { settle } from "@/components/public/server";
import { getSingletonData } from "@/modules/content/queries";

/** Public contact details: the CMS site settings (contact group) merged over the business defaults. */
export async function loadSiteContact(): Promise<{ contact: ResolvedContact; legalName: string | null }> {
  const settings = await settle("site_settings.contact", () => getSingletonData("site_settings"), null);
  return { contact: resolveContact(settings?.contact), legalName: settings?.legalEntity?.name?.trim() || null };
}

export async function loadPublicContact(): Promise<ResolvedContact> {
  return (await loadSiteContact()).contact;
}
