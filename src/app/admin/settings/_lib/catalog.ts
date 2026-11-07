import { SETTINGS, type SellerDetailsSetting, type SettingKey } from "@/config/settings";

/**
 * Typed editing model for the platform settings catalogue (pure, client-safe).
 * `SETTINGS` (src/config/settings.ts) is the source of truth for keys, labels, groups and defaults;
 * this file adds input kinds and validation bounds so the Command Centre can render and check them.
 */

export type SettingInputKind = "boolean" | "number" | "text" | "currency" | "country" | "seller";

export type SettingMeta = {
  key: SettingKey;
  label: string;
  group: string;
  kind: SettingInputKind;
  min?: number;
  max?: number;
  maxLength?: number;
  hint?: string;
};

/** Groups edited on their own pages (not on the settings home). */
export const DEDICATED_GROUPS: Record<string, { href: string; label: string }> = {
  Security: { href: "/admin/settings/security", label: "Security" },
};

/** Validation bounds and hints. Anything not listed gets the defaults derived from its type. */
const OVERRIDES: Partial<Record<SettingKey, Partial<SettingMeta>>> = {
  "security.password_min_length": { min: 8, max: 128, hint: "Applies to new and changed passwords. 10 or more is recommended." },
  "security.max_failed_logins": { min: 3, max: 50 },
  "security.lockout_minutes": { min: 1, max: 1440 },
  "privacy.data_request_sla_days": { min: 1, max: 90, hint: "The DPDP Rules set the outer limit; keep this at or below it." },
  "privacy.grievance_ack_hours": { min: 1, max: 168, hint: "Shown on the grievance page and used for acknowledgement alerts." },
  "privacy.grievance_resolution_days": { min: 1, max: 30, hint: "Shown on the grievance page. Confirm the legal limit with counsel before changing it." },
  "privacy.policy_version": { maxLength: 40, hint: "Changing this asks signed-in people to review the updated notice." },
  "privacy.terms_version": { maxLength: 40 },
  "analytics.retention_days_events": { min: 1, max: 3650 },
  "analytics.retention_days_heatmaps": { min: 1, max: 3650 },
  "analytics.retention_days_sessions": { min: 1, max: 3650 },
  "analytics.clarity_project_id": { maxLength: 40, hint: "Only used when Clarity is switched on in Modules and the visitor consents." },
  "analytics.ga4_measurement_id": { maxLength: 40, hint: "Format G-XXXXXXX. Only used with consent." },
  "analytics.consent_version": { maxLength: 20 },
  "commercial.default_currency": { kind: "currency", hint: "Used only when a record has no currency of its own." },
  "commercial.invoice_prefix_note": { maxLength: 500 },
  "commercial.grace_period_days": { min: 0, max: 90 },
  "commercial.invoice_due_days": { min: 0, max: 120 },
  "commercial.default_tax_code": { maxLength: 10 },
  "orgs.invitation_ttl_days": { min: 1, max: 60 },
  "recruitment.application_edit_window_hours": { min: 0, max: 720, hint: "0 means applications cannot be edited after submission." },
  "recruitment.job_default_duration_days": { min: 1, max: 365 },
  "recruitment.partner_attribution_days": { min: 1, max: 730 },
  "recruitment.profile_unlock_days": { min: 1, max: 730 },
  "platform.home_country": { kind: "country" },
  "support.sla_hours_urgent": { min: 1, max: 720 },
  "support.sla_hours_high": { min: 1, max: 720 },
  "support.sla_hours_normal": { min: 1, max: 720 },
  "support.sla_hours_low": { min: 1, max: 720 },
};

function baseKind(value: unknown): SettingInputKind {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "text";
  return "seller";
}

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function settingMeta(key: SettingKey): SettingMeta {
  const def = SETTINGS[key];
  const kind = OVERRIDES[key]?.kind ?? baseKind(def.default);
  return {
    key,
    label: def.label,
    group: def.group,
    kind,
    min: kind === "number" ? 0 : undefined,
    max: kind === "number" ? 100_000 : undefined,
    maxLength: kind === "text" ? 200 : undefined,
    ...OVERRIDES[key],
  };
}

/** Groups in catalogue order with their keys. */
export function settingGroups(): { group: string; keys: SettingKey[] }[] {
  const out: { group: string; keys: SettingKey[] }[] = [];
  for (const key of SETTING_KEYS) {
    const group = SETTINGS[key].group;
    let entry = out.find((g) => g.group === group);
    if (!entry) {
      entry = { group, keys: [] };
      out.push(entry);
    }
    entry.keys.push(key);
  }
  return out;
}

export const SELLER_FIELDS: { name: keyof SellerDetailsSetting; label: string; required?: boolean; maxLength: number; textarea?: boolean; hint?: string }[] = [
  { name: "legalName", label: "Legal name", required: true, maxLength: 200 },
  { name: "address", label: "Address (as printed)", required: true, maxLength: 500, textarea: true },
  { name: "taxId", label: "GSTIN", maxLength: 15, hint: "Leave blank while unregistered: no GST is charged and documents say “Invoice”." },
  { name: "stateCode", label: "GST state code", required: true, maxLength: 2, hint: "Two digits, e.g. 37 for Andhra Pradesh." },
  { name: "countryCode", label: "Country code", maxLength: 2 },
  { name: "city", label: "City", maxLength: 100 },
  { name: "postalCode", label: "Postal code", maxLength: 12 },
  { name: "stateRegion", label: "State / region", maxLength: 100 },
  { name: "email", label: "Billing e-mail", maxLength: 200 },
  { name: "phone", label: "Billing phone", maxLength: 30 },
  { name: "paymentInstructions", label: "Payment instructions on unpaid invoices", maxLength: 1000, textarea: true, hint: "Bank account or UPI details entered by finance." },
];

export const fieldName = (key: SettingKey, sub?: string) => (sub ? `${key}.${sub}` : key);

export type ParsedSettings = { values: Partial<Record<SettingKey, unknown>>; fieldErrors: Record<string, string[]> };

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Parse submitted form values for a set of keys. Inputs come from `formDataToObject` (blank → undefined,
 * unchecked checkbox → absent). Returns typed values and field errors keyed by input name.
 */
export function parseSettingValues(keys: readonly SettingKey[], input: Record<string, unknown>, known: { currencies?: readonly string[]; countries?: readonly string[] } = {}): ParsedSettings {
  const values: Partial<Record<SettingKey, unknown>> = {};
  const fieldErrors: Record<string, string[]> = {};
  const err = (name: string, message: string) => (fieldErrors[name] ??= []).push(message);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : v === undefined || v === null ? "" : String(v).trim());

  for (const key of keys) {
    const meta = settingMeta(key);
    const raw = input[key];
    switch (meta.kind) {
      case "boolean":
        values[key] = raw === true || raw === "true" || raw === "on" || raw === "1";
        break;
      case "number": {
        const s = str(raw);
        if (s === "") {
          err(key, `${meta.label} is required`);
          break;
        }
        const n = Number(s);
        if (!Number.isInteger(n)) err(key, "Enter a whole number");
        else if (meta.min !== undefined && n < meta.min) err(key, `Must be at least ${meta.min}`);
        else if (meta.max !== undefined && n > meta.max) err(key, `Must be at most ${meta.max}`);
        else values[key] = n;
        break;
      }
      case "text": {
        const s = str(raw);
        if (meta.maxLength && s.length > meta.maxLength) err(key, `Use at most ${meta.maxLength} characters`);
        else values[key] = s;
        break;
      }
      case "currency": {
        const s = str(raw).toUpperCase();
        if (!/^[A-Z]{3}$/.test(s)) err(key, "Choose a currency");
        else if (known.currencies && !known.currencies.includes(s)) err(key, "Choose an active currency");
        else values[key] = s;
        break;
      }
      case "country": {
        const s = str(raw).toUpperCase();
        if (!/^[A-Z]{2}$/.test(s)) err(key, "Choose a country");
        else if (known.countries && !known.countries.includes(s)) err(key, "Choose an active country");
        else values[key] = s;
        break;
      }
      case "seller": {
        const out: Record<string, string> = {};
        for (const field of SELLER_FIELDS) {
          const name = fieldName(key, field.name);
          let s = str(input[name]);
          if (field.name === "taxId" || field.name === "countryCode") s = s.toUpperCase();
          if (field.required && !s) err(name, `${field.label} is required`);
          else if (s.length > field.maxLength) err(name, `Use at most ${field.maxLength} characters`);
          else if (field.name === "taxId" && s && !GSTIN.test(s)) err(name, "Enter a valid 15-character GSTIN");
          else if (field.name === "stateCode" && s && !/^\d{2}$/.test(s)) err(name, "Enter the two-digit state code");
          else if (field.name === "countryCode" && s && !/^[A-Z]{2}$/.test(s)) err(name, "Use a two-letter country code");
          if (s) out[field.name] = s;
        }
        if (out.taxId && out.stateCode && out.taxId.slice(0, 2) !== out.stateCode) {
          err(fieldName(key, "taxId"), "The first two digits of the GSTIN must match the state code");
        }
        values[key] = out;
        break;
      }
    }
  }
  return { values, fieldErrors };
}

/** Stable comparison used to audit only real changes. */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

function normalise(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined && x !== "")
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return v;
}

/** Human display of a value (audit metadata and "default" hints). */
export function displayValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (v === "" || v === null || v === undefined) return "blank";
  if (typeof v === "object") return "details";
  return String(v);
}
