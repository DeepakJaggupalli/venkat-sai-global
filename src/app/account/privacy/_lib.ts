import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { candidateProfiles } from "@/db/schema";
import { hasConsent } from "@/modules/identity/consent";
import { isMinor } from "@/modules/candidates/profile-rules";

/** Communication consents a person manages from /account/privacy (record-level purposes live with their features). */
export const COMMUNICATION_PURPOSES = ["marketing_email", "marketing_sms", "whatsapp_updates"] as const;
export type CommunicationPurpose = (typeof COMMUNICATION_PURPOSES)[number];

export const COMMUNICATION_LABELS: Record<CommunicationPurpose, { label: string; description: string; marketing: boolean }> = {
  marketing_email: { label: "News and opportunities by email", description: "Occasional emails about new services, courses and hiring drives.", marketing: true },
  marketing_sms: { label: "News and opportunities by SMS", description: "Occasional text messages about new services and drives.", marketing: true },
  whatsapp_updates: { label: "Updates on WhatsApp", description: "Account and application updates sent to your verified WhatsApp number.", marketing: false },
};

/** DPDP Rules 2025: no marketing to children. Uses the candidate profile's date of birth / guardian consent. */
export async function isChildAccount(userId: string): Promise<boolean> {
  const [profile] = await db.select({ dob: candidateProfiles.dateOfBirth }).from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).limit(1);
  if (!profile) return false;
  return isMinor(profile.dob, await hasConsent(userId, "guardian_consent"));
}
