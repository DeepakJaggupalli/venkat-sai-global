/** Consent purposes the candidate grants or withdraws directly in the ledger from /talent/privacy (client-safe). */
export const LEDGER_PURPOSES = ["marketing_email", "marketing_sms", "whatsapp_updates", "overseas_processing"] as const;
export type LedgerPurpose = (typeof LEDGER_PURPOSES)[number];

/** Managed through the candidates module (self only). */
export const MODULE_PURPOSES = ["share_assessment_results", "contact_references"] as const;

/** Shown on the dashboard but changed elsewhere (visibility, partner setting, per application). */
export const ELSEWHERE_PURPOSES = ["profile_discoverable", "partner_submission", "share_profile_with_employers"] as const;

/** Purposes a child (under 18) may never grant. */
export const MINOR_BLOCKED_PURPOSES: readonly string[] = ["marketing_email", "marketing_sms", "overseas_processing"];
