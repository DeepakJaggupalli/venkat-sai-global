/**
 * Platform settings catalogue (client-safe). Values are stored in `platform_settings`
 * (edited at /admin/settings); these defaults apply when no row exists.
 * Add new keys here first — `getSetting()` is typed from this object.
 */
const isProd = process.env.NODE_ENV === "production";

export const SETTINGS = {
  // Security
  "security.require_staff_2fa": { default: isProd, label: "Require two-factor authentication for staff", group: "Security" },
  "security.password_min_length": { default: 10, label: "Minimum password length", group: "Security" },
  "security.max_failed_logins": { default: 8, label: "Failed sign-ins before temporary lock", group: "Security" },
  "security.lockout_minutes": { default: 15, label: "Temporary lock duration (minutes)", group: "Security" },

  // Privacy & grievance (DPDP Act 2023 / IT Rules 2021)
  "privacy.data_request_sla_days": { default: 30, label: "Data request response time (days)", group: "Privacy" },
  "privacy.grievance_ack_hours": { default: 24, label: "Grievance acknowledgement time (hours)", group: "Privacy" },
  // IT (Intermediary Guidelines) Rules 2021 as amended in 2026: 7-day resolution limit (verify with counsel).
  "privacy.grievance_resolution_days": { default: 7, label: "Grievance resolution time (days, IT Rules limit)", group: "Privacy" },
  "privacy.policy_version": { default: "2026-11-01", label: "Current privacy notice version", group: "Privacy" },
  "privacy.terms_version": { default: "2026-11-01", label: "Current terms of service version", group: "Privacy" },

  // Analytics retention
  "analytics.retention_days_events": { default: 395, label: "Keep raw analytics events (days)", group: "Analytics" },
  "analytics.retention_days_heatmaps": { default: 90, label: "Keep heatmap points (days)", group: "Analytics" },
  "analytics.retention_days_sessions": { default: 395, label: "Keep session records (days)", group: "Analytics" },
  "analytics.clarity_project_id": { default: "", label: "Microsoft Clarity project ID (optional)", group: "Analytics" },
  "analytics.ga4_measurement_id": { default: "", label: "Google Analytics 4 measurement ID (optional)", group: "Analytics" },

  // Commercial
  "commercial.default_currency": { default: "INR", label: "Default billing currency", group: "Commercial" },
  "commercial.enforce_limits": { default: false, label: "Enforce plan limits and credits", group: "Commercial" },
  "commercial.invoice_prefix_note": { default: "", label: "Invoice footer note", group: "Commercial" },
  "commercial.seller_details": {
    default: { legalName: "Venkat Sai Welding Works and Testing Center", address: "Auto Nagar, Visakhapatnam, Andhra Pradesh, India", taxId: "", stateCode: "37" },
    label: "Seller details printed on invoices",
    group: "Commercial",
  },

  // Recruitment
  "recruitment.application_edit_window_hours": { default: 0, label: "Hours a candidate may edit an application after submitting", group: "Recruitment" },
  "recruitment.job_default_duration_days": { default: 30, label: "Default job listing duration (days)", group: "Recruitment" },
  "recruitment.partner_attribution_days": { default: 90, label: "Partner candidate attribution window (days)", group: "Recruitment" },
  "recruitment.profile_unlock_days": { default: 90, label: "How long an employer contact unlock lasts (days)", group: "Recruitment" },

  // Platform
  /** ISO country code of Venkat Sai's home market; jobs outside it are flagged as overseas. */
  "platform.home_country": { default: "IN", label: "Home country (jobs elsewhere are overseas)", group: "Platform" },

  // Support
  "support.sla_hours_urgent": { default: 4, label: "Urgent ticket first-response SLA (hours)", group: "Support" },
  "support.sla_hours_high": { default: 8, label: "High priority SLA (hours)", group: "Support" },
  "support.sla_hours_normal": { default: 24, label: "Normal priority SLA (hours)", group: "Support" },
  "support.sla_hours_low": { default: 72, label: "Low priority SLA (hours)", group: "Support" },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]["default"] extends boolean
  ? boolean
  : (typeof SETTINGS)[K]["default"] extends number
    ? number
    : (typeof SETTINGS)[K]["default"] extends string
      ? string
      : (typeof SETTINGS)[K]["default"];
