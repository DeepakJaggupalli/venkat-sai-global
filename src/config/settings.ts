/**
 * Platform settings catalogue (client-safe). Values are stored in `platform_settings`
 * (edited at /admin/settings); these defaults apply when no row exists.
 * Add new keys here first — `getSetting()` is typed from this object.
 */
const isProd = process.env.NODE_ENV === "production";

/** Seller (supplier) details printed on invoices. Only legalName/address are required; finance fills the rest. */
export type SellerDetailsSetting = {
  legalName: string;
  address: string;
  /** GSTIN. Blank = unregistered supplier: no GST is charged and documents say "Invoice", not "Tax invoice". */
  taxId: string;
  /** GST state code of the place of business (37 = Andhra Pradesh). */
  stateCode: string;
  countryCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  stateRegion?: string;
  email?: string;
  phone?: string;
  taxIdType?: string;
  /** Bank account / UPI details shown on unpaid invoices. Never invented — finance enters them. */
  paymentInstructions?: string;
};

/** Price of the "Prepare my resume" service. amountMinor 0 = price on request (staff quote it on WhatsApp). */
export type ResumeServicePriceSetting = { amountMinor: number; currency: string };

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
  /** Bump to re-ask every visitor for cookie consent (combined with the privacy notice version). */
  "analytics.consent_version": { default: "1", label: "Cookie consent version (change to re-ask everyone)", group: "Analytics" },

  // Commercial
  "commercial.default_currency": { default: "INR", label: "Default billing currency", group: "Commercial" },
  "commercial.enforce_limits": { default: false, label: "Enforce plan limits and credits", group: "Commercial" },
  "commercial.invoice_prefix_note": { default: "", label: "Invoice footer note", group: "Commercial" },
  "commercial.seller_details": {
    default: {
      legalName: "Venkat Sai Welding Works and Testing Center",
      address: "Auto Nagar, Visakhapatnam, Andhra Pradesh, India",
      taxId: "",
      stateCode: "37",
    } as SellerDetailsSetting,
    label: "Seller details printed on invoices",
    group: "Commercial",
  },
  "commercial.grace_period_days": { default: 7, label: "Days a past-due subscription stays live", group: "Commercial" },
  "commercial.invoice_due_days": { default: 15, label: "Days from invoice issue until due", group: "Commercial" },
  "commercial.export_zero_rated": { default: true, label: "Zero-rate export of services (LUT filed)", group: "Commercial" },
  "commercial.default_tax_code": { default: "9985", label: "Default SAC / HSN code on invoice lines", group: "Commercial" },

  // Organisations
  "orgs.invitation_ttl_days": { default: 7, label: "Team invitation validity (days)", group: "Organisations" },

  // Recruitment
  "recruitment.application_edit_window_hours": { default: 0, label: "Hours a candidate may edit an application after submitting", group: "Recruitment" },
  "recruitment.job_default_duration_days": { default: 30, label: "Default job listing duration (days)", group: "Recruitment" },
  "recruitment.partner_attribution_days": { default: 90, label: "Partner candidate attribution window (days)", group: "Recruitment" },
  "recruitment.profile_unlock_days": { default: 90, label: "How long an employer contact unlock lasts (days)", group: "Recruitment" },

  // Platform
  /** ISO country code of Venkat Sai's home market; jobs outside it are flagged as overseas. */
  "platform.home_country": { default: "IN", label: "Home country (jobs elsewhere are overseas)", group: "Platform" },

  // Notifications
  /** Business inbox that receives a copy of every new CV, contact enquiry and workforce requirement (blank = off). */
  "notifications.business_inbox_email": { default: "vsweld@gmail.com", label: "Business inbox for new CVs, enquiries and requirements (blank = none)", group: "Notifications" },

  // Resume service ("Prepare my resume", edited on /admin/resume-requests)
  /** Price of the paid resume-writing service: amount in minor units + ISO currency. 0 = "Price on request". */
  "resume_service.price": { default: { amountMinor: 0, currency: "" } as ResumeServicePriceSetting, label: "Resume service price", group: "Resume service" },

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
