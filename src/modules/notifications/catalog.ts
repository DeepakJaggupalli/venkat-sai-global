/**
 * Display labels for notification categories and channels (client-safe; English — pass `labels` to the
 * components to translate them in the People Portal).
 */
import type { NotificationCategory, NotificationChannel } from "./events";

export const CATEGORY_LABELS: Record<NotificationCategory, { label: string; description: string }> = {
  account: { label: "Account and security", description: "Sign-in alerts, password changes, data requests and account notices." },
  applications: { label: "Applications and offers", description: "Updates on your job applications, offers and joining process." },
  interviews: { label: "Interviews and assessments", description: "Interview and assessment schedules, changes, reminders and results." },
  job_alerts: { label: "Job alerts", description: "New jobs that match your saved job alerts." },
  recruitment: { label: "Hiring and recruitment", description: "Jobs, applicants, workforce requirements and partner assignments." },
  organization: { label: "Organisation", description: "Invitations, team changes and verification of your organisation." },
  billing: { label: "Billing", description: "Invoices, payments, renewals, refunds and credits." },
  support: { label: "Support", description: "Replies and updates on support requests and enquiries." },
  training: { label: "Training", description: "Enrolments, batch start dates and certificates." },
  announcements: { label: "Announcements", description: "Service announcements from Venkat Sai Global." },
  approvals: { label: "Approvals and assigned work", description: "Reviews of your submissions, and work assigned to you." },
  messages: { label: "Messages", description: "New messages in your conversations with Venkat Sai Global." },
};

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: "In-app",
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

/** Categories a pure candidate (no organisation membership, not staff) never receives. */
export const BUSINESS_ONLY_CATEGORIES: readonly NotificationCategory[] = ["organization", "billing", "recruitment"];

/** Client-safe copies of the schema enums (src/db/schema/notifications.ts must stay in sync — enforced by catalog.test.ts). */
export const NOTIFICATION_CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as [NotificationCategory, ...NotificationCategory[]];
export const NOTIFICATION_CHANNEL_KEYS = Object.keys(CHANNEL_LABELS) as [NotificationChannel, ...NotificationChannel[]];
