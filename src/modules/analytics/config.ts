import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { SETTINGS } from "@/config/settings";
import { db } from "@/db";
import { candidateProfiles } from "@/db/schema";
import { logger } from "@/lib/logger";
import { candidateIsMinorSql } from "@/modules/candidates/minor-sql";
import { getCurrentUser, type SessionUser } from "@/modules/identity/session";
import { getSetting, isFeatureEnabled } from "@/modules/settings";

import { buildConsentVersion } from "./consent";
import type { AnalyticsClientConfig, ConsentServices } from "./types";

/**
 * Server-side analytics configuration: the consent version, who is excluded from tracking, and the
 * props handed to the browser tracker / consent banner by their server wrappers.
 */

/** Current consent version (`<CONSENT_REVISION>.<privacy.policy_version>`); falls back to the default notice version. */
/**
 * Consent version = code revision + privacy notice version + the admin "re-ask" counter
 * (`analytics.consent_version`). Changing either setting re-prompts every visitor.
 */
export async function getConsentVersion(): Promise<string> {
  try {
    const [policy, counter] = await Promise.all([getSetting("privacy.policy_version"), getSetting("analytics.consent_version")]);
    return buildConsentVersion(`${policy}.c${counter}`);
  } catch (error) {
    logger.warn("Could not read the consent version settings; using the defaults", { error });
    return buildConsentVersion(`${SETTINGS["privacy.policy_version"].default}.c${SETTINGS["analytics.consent_version"].default}`);
  }
}

const CLARITY_ID_RE = /^[a-z0-9]{6,20}$/i;
const GA4_ID_RE = /^G-[A-Z0-9]{4,16}$/;

/** Clarity project id from settings, or null when unset or malformed. */
export function validClarityProjectId(value: unknown): string | null {
  return typeof value === "string" && CLARITY_ID_RE.test(value.trim()) ? value.trim() : null;
}

/** GA4 measurement id (G-XXXXXXX) from settings, or null when unset or malformed. */
export function validGa4MeasurementId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  return GA4_ID_RE.test(v) ? v : null;
}

/**
 * Is this signed-in person excluded from all tracking? Staff (internal traffic) and children under 18
 * (DPDP Rules 2025: no tracking, heatmaps or marketing for minors).
 */
export async function isExcludedFromTracking(user: Pick<SessionUser, "id" | "isStaff"> | null): Promise<boolean> {
  if (!user) return false;
  if (user.isStaff) return true;
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(candidateProfiles)
    .where(and(eq(candidateProfiles.userId, user.id), candidateIsMinorSql))
    .limit(1);
  return rows.length > 0;
}

/** Third-party services that are switched on and configured (disclosed in the consent UI). */
export async function getConsentServices(): Promise<ConsentServices> {
  try {
    const [clarityOn, ga4On, clarityId, ga4Id] = await Promise.all([
      isFeatureEnabled("analytics.clarity"),
      isFeatureEnabled("analytics.ga4"),
      getSetting("analytics.clarity_project_id"),
      getSetting("analytics.ga4_measurement_id"),
    ]);
    return { clarity: clarityOn && validClarityProjectId(clarityId) !== null, ga4: ga4On && validGa4MeasurementId(ga4Id) !== null };
  } catch (error) {
    logger.warn("Could not read analytics service settings", { error });
    return { clarity: false, ga4: false };
  }
}

const DISABLED: Omit<AnalyticsClientConfig, "consentVersion" | "nonce"> = {
  enabled: false,
  heatmaps: false,
  clarityProjectId: null,
  ga4MeasurementId: null,
};

/**
 * Props for the browser tracker. Everything is off for staff and minors; third-party ids are only passed
 * when their feature flag is on and the setting is valid. Never throws (analytics must not break pages).
 */
export async function getAnalyticsClientConfig(): Promise<AnalyticsClientConfig> {
  const consentVersion = await getConsentVersion();
  let nonce: string | null = null;
  try {
    nonce = (await headers()).get("x-nonce");
  } catch {
    nonce = null;
  }
  try {
    const user = await getCurrentUser();
    if (await isExcludedFromTracking(user)) return { ...DISABLED, consentVersion, nonce };
    const [firstParty, heatmaps, clarityOn, ga4On, clarityId, ga4Id] = await Promise.all([
      isFeatureEnabled("analytics.first_party"),
      isFeatureEnabled("analytics.heatmaps"),
      isFeatureEnabled("analytics.clarity"),
      isFeatureEnabled("analytics.ga4"),
      getSetting("analytics.clarity_project_id"),
      getSetting("analytics.ga4_measurement_id"),
    ]);
    return {
      enabled: firstParty,
      heatmaps: firstParty && heatmaps,
      consentVersion,
      clarityProjectId: clarityOn ? validClarityProjectId(clarityId) : null,
      ga4MeasurementId: ga4On ? validGa4MeasurementId(ga4Id) : null,
      nonce,
    };
  } catch (error) {
    logger.warn("Analytics tracker configuration failed; tracking disabled for this request", { error });
    return { ...DISABLED, consentVersion, nonce };
  }
}
