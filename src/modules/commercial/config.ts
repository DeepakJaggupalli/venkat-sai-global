import "server-only";

import { inArray } from "drizzle-orm";

import { SETTINGS, type SettingKey, type SettingValue } from "@/config/settings";
import { db, type DbOrTx } from "@/db";
import { platformSettings } from "@/db/schema";
import type { InvoicePartySnapshot } from "@/db/schema/commercial";
import { env, integrations } from "@/lib/env";
import { getSetting, isFeatureEnabled } from "@/modules/settings";

import { COMMERCIAL_CONFIG_DEFAULTS, type CommercialConfigKey } from "./constants";

/**
 * Commercial configuration.
 *  - Seller details come from the `commercial.seller_details` setting (Settings → Commercial). Accepted fields:
 *    legalName, address (one line) or addressLine1/addressLine2/city/postalCode, stateRegion, stateCode (GST),
 *    countryCode (defaults to `platform.home_country`), taxId (GSTIN — blank = not GST-registered), email, phone.
 *  - Values not yet in the settings catalogue are read from `platform_settings` by key, with the defaults in
 *    COMMERCIAL_CONFIG_DEFAULTS (README → Configuration).
 */

export type SellerDetails = InvoicePartySnapshot & { countryCode: string; stateCode: string | null; taxId: string | null };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Read catalogue settings through a given executor. Inside a transaction, pass `tx`: reading through the global
 * pool would need a second connection while the transaction holds one, which can starve the pool under load.
 * Without `tx` the request-memoised getSetting() is used.
 */
async function readSettings<K extends SettingKey>(keys: K[], tx?: DbOrTx): Promise<{ [P in K]: SettingValue<P> }> {
  if (!tx) {
    const entries = await Promise.all(keys.map(async (k) => [k, await getSetting(k)] as const));
    return Object.fromEntries(entries) as { [P in K]: SettingValue<P> };
  }
  const rows = await tx.select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings).where(inArray(platformSettings.key, keys));
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(keys.map((k) => [k, stored.has(k) ? stored.get(k) : SETTINGS[k].default])) as { [P in K]: SettingValue<P> };
}

export async function getSellerDetails(tx?: DbOrTx): Promise<SellerDetails> {
  const settings = await readSettings(["commercial.seller_details", "platform.home_country"], tx);
  const raw = (settings["commercial.seller_details"] ?? {}) as Record<string, unknown>;
  const homeCountry = settings["platform.home_country"];
  const countryCode = (str(raw.countryCode) ?? homeCountry ?? "IN").toUpperCase();
  const taxId = str(raw.taxId)?.toUpperCase() ?? null;
  return {
    legalName: str(raw.legalName) ?? "Venkat Sai Global",
    contactName: str(raw.contactName),
    email: str(raw.email),
    phone: str(raw.phone),
    addressLine1: str(raw.addressLine1) ?? str(raw.address),
    addressLine2: str(raw.addressLine2),
    city: str(raw.city),
    stateRegion: str(raw.stateRegion),
    stateCode: str(raw.stateCode),
    postalCode: str(raw.postalCode),
    countryCode,
    taxIdType: taxId ? (countryCode === "IN" ? "gstin" : (str(raw.taxIdType) as InvoicePartySnapshot["taxIdType"]) ?? "other") : null,
    taxId,
  };
}

/**
 * Printed on invoices: the footer note (`commercial.invoice_prefix_note`) and optional offline payment
 * instructions (`paymentInstructions` field of `commercial.seller_details`, e.g. bank account / UPI ID entered by
 * finance). Nothing is shown when they are not configured.
 */
export async function getInvoiceFooter(): Promise<{ note: string | null; paymentInstructions: string | null }> {
  const note = await getSetting("commercial.invoice_prefix_note");
  const raw = (await getSetting("commercial.seller_details")) as Record<string, unknown>;
  return { note: str(note), paymentInstructions: str(raw.paymentInstructions) };
}

export type CommercialConfig = { [K in CommercialConfigKey]: (typeof COMMERCIAL_CONFIG_DEFAULTS)[K] extends boolean ? boolean : (typeof COMMERCIAL_CONFIG_DEFAULTS)[K] extends number ? number : string };

/** Commercial configuration with defaults (reads platform_settings rows when present). */
export async function getCommercialConfig(tx: DbOrTx = db): Promise<CommercialConfig> {
  const keys = Object.keys(COMMERCIAL_CONFIG_DEFAULTS) as CommercialConfigKey[];
  const rows = await tx.select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings).where(inArray(platformSettings.key, keys));
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const fallback = COMMERCIAL_CONFIG_DEFAULTS[key];
    const value = stored.get(key);
    out[key] = typeof value === typeof fallback ? value : fallback;
  }
  const config = out as CommercialConfig;
  config["commercial.grace_period_days"] = clampInt(config["commercial.grace_period_days"], 0, 90, COMMERCIAL_CONFIG_DEFAULTS["commercial.grace_period_days"]);
  config["commercial.invoice_due_days"] = clampInt(config["commercial.invoice_due_days"], 0, 120, COMMERCIAL_CONFIG_DEFAULTS["commercial.invoice_due_days"]);
  return config;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/** Is commercial.enforce_limits on? Pass `tx` when called inside a transaction (see readSettings). */
export async function isEnforcingLimits(tx?: DbOrTx): Promise<boolean> {
  const settings = await readSettings(["commercial.enforce_limits"], tx);
  return Boolean(settings["commercial.enforce_limits"]);
}

export type OnlinePaymentOptions = { razorpay: boolean; stripe: boolean; any: boolean };

/**
 * Online payments are offered only when the `commercial.online_payments` flag is on AND the gateway keys are
 * configured. Otherwise invoices are payable offline (bank transfer / UPI / cheque recorded by finance).
 */
export async function getOnlinePaymentOptions(organizationId?: string | null): Promise<OnlinePaymentOptions> {
  const enabled = await isFeatureEnabled("commercial.online_payments", organizationId ? { organizationId } : {});
  const razorpay = enabled && integrations.razorpay();
  const stripe = enabled && integrations.stripe();
  return { razorpay, stripe, any: razorpay || stripe };
}

export function razorpayCredentials(): { keyId: string; keySecret: string } | null {
  const e = env();
  return e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET ? { keyId: e.RAZORPAY_KEY_ID, keySecret: e.RAZORPAY_KEY_SECRET } : null;
}

export function stripeSecretKey(): string | null {
  return env().STRIPE_SECRET_KEY ?? null;
}
