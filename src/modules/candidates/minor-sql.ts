import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { candidateProfiles } from "@/db/schema";

/**
 * SQL mirrors of profile-rules.ts `isMinor` for queries over candidate_profiles (DPDP Rules 2025):
 * a child is under 18 by date of birth, or — without a date of birth — has a guardian-consent record.
 */
export const candidateIsMinorSql: SQL = sql`(
  (${candidateProfiles.dateOfBirth} is not null and ${candidateProfiles.dateOfBirth} > (current_date - interval '18 years'))
  or (${candidateProfiles.dateOfBirth} is null and exists (
    select 1 from consent_records gc where gc.user_id = ${candidateProfiles.userId} and gc.purpose = 'guardian_consent'))
)`;

/** The candidate's latest guardian_consent record is granted. */
export const guardianConsentGrantedSql: SQL = sql`coalesce((
  select gc.granted from consent_records gc
  where gc.user_id = ${candidateProfiles.userId} and gc.purpose = 'guardian_consent'
  order by gc.created_at desc limit 1), false)`;

/** A minor without granted guardian consent: never shown to organisations. */
export const restrictedMinorSql: SQL = sql`(${candidateIsMinorSql} and not ${guardianConsentGrantedSql})`;
