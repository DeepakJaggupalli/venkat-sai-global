/**
 * Notification event catalogue (client-safe).
 *
 * Every `notify({ event })` call must use a key from this list. The notifications module
 * provides a default template per event and channel (editable at /admin/notifications/templates).
 * `mandatory` events (security, legal, transactional receipts) ignore user opt-outs for email/in-app.
 */
export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp";

export type NotificationCategory =
  | "account"
  | "applications"
  | "interviews"
  | "job_alerts"
  | "recruitment"
  | "organization"
  | "billing"
  | "support"
  | "training"
  | "announcements"
  | "approvals"
  | "messages";

type EventDef = {
  label: string;
  category: NotificationCategory;
  defaultChannels: NotificationChannel[];
  mandatory?: boolean;
};

const e = (label: string, category: NotificationCategory, defaultChannels: NotificationChannel[], mandatory = false): EventDef => ({
  label,
  category,
  defaultChannels,
  mandatory,
});

export const NOTIFICATION_EVENTS = {
  // Account & security
  "account.welcome": e("Welcome to Venkat Sai Global", "account", ["in_app", "email"]),
  "account.password_changed": e("Password changed", "account", ["email", "in_app"], true),
  "account.security_alert": e("Security alert (new sign-in, 2FA change)", "account", ["email", "in_app"], true),
  "account.closed": e("Account closed", "account", ["email"], true),

  // Organisations
  "org.invitation": e("Invitation to join an organisation", "organization", ["email"], true),
  "org.verification_submitted": e("Verification submitted", "organization", ["in_app", "email"]),
  "org.verification_approved": e("Organisation verified", "organization", ["in_app", "email"], true),
  "org.verification_rejected": e("Verification not approved", "organization", ["in_app", "email"], true),
  "org.verification_changes_requested": e("Verification needs changes", "organization", ["in_app", "email"], true),
  "org.verification_expiring": e("Verification or licence expiring", "organization", ["in_app", "email"], true),
  "org.member_added": e("New team member", "organization", ["in_app"]),

  // Jobs
  "job.submitted": e("Job submitted for review", "recruitment", ["in_app"]),
  "job.approved": e("Job approved and published", "recruitment", ["in_app", "email"]),
  "job.rejected": e("Job not approved", "recruitment", ["in_app", "email"]),
  "job.changes_requested": e("Job needs changes", "recruitment", ["in_app", "email"]),
  "job.closing_soon": e("Job closing soon", "recruitment", ["in_app"]),
  "job.alert_digest": e("New jobs matching your alerts", "job_alerts", ["email", "in_app"]),

  // Applications (candidate-facing)
  "application.submitted": e("Application submitted", "applications", ["in_app", "email"], true),
  "application.status_changed": e("Application status updated", "applications", ["in_app", "email"]),
  "application.withdrawn": e("Application withdrawn", "applications", ["in_app"]),
  // Applications (employer/partner/staff-facing)
  "application.received": e("New application received", "recruitment", ["in_app", "email"]),

  // Interviews & assessments
  "interview.scheduled": e("Interview scheduled", "interviews", ["in_app", "email", "sms"]),
  "interview.rescheduled": e("Interview rescheduled", "interviews", ["in_app", "email", "sms"]),
  "interview.cancelled": e("Interview cancelled", "interviews", ["in_app", "email", "sms"]),
  "interview.reminder": e("Interview reminder", "interviews", ["in_app", "email", "sms"]),
  "assessment.scheduled": e("Assessment scheduled", "interviews", ["in_app", "email", "sms"]),
  "assessment.result": e("Assessment result available", "interviews", ["in_app", "email"]),

  // Offers & placement
  "offer.issued": e("Offer issued", "applications", ["in_app", "email"], true),
  "offer.responded": e("Offer accepted / declined", "recruitment", ["in_app", "email"]),
  "placement.mobilisation_update": e("Mobilisation update", "applications", ["in_app", "email"]),
  "placement.joined": e("Joining confirmed", "recruitment", ["in_app"]),

  // Requirements (employer-facing + staff)
  "requirement.received": e("Workforce requirement received", "recruitment", ["in_app", "email"]),
  "requirement.status_changed": e("Requirement status updated", "recruitment", ["in_app", "email"]),

  // Recruitment partners
  "partner.assignment_created": e("New requirement assigned", "recruitment", ["in_app", "email"]),
  "partner.submission_status_changed": e("Submission status updated", "recruitment", ["in_app", "email"]),
  "partner.document_requested": e("Document requested", "recruitment", ["in_app", "email"]),

  // Training
  "training.enrolment_confirmed": e("Enrolment confirmed", "training", ["in_app", "email"]),
  "training.batch_starting": e("Batch starting soon", "training", ["in_app", "email", "sms"]),
  "training.certificate_issued": e("Certificate issued", "training", ["in_app", "email"]),

  // Billing
  "billing.invoice_issued": e("Invoice issued", "billing", ["in_app", "email"], true),
  "billing.payment_received": e("Payment received", "billing", ["in_app", "email"], true),
  "billing.payment_failed": e("Payment failed", "billing", ["in_app", "email"], true),
  "billing.renewal_due": e("Subscription renewal due", "billing", ["in_app", "email"]),
  "billing.subscription_expired": e("Subscription expired", "billing", ["in_app", "email"], true),
  "billing.credits_low": e("Credits running low", "billing", ["in_app", "email"]),
  "billing.refund_processed": e("Refund processed", "billing", ["in_app", "email"], true),

  // Support, privacy
  "support.ticket_created": e("Support request received", "support", ["in_app", "email"], true),
  "support.ticket_reply": e("New reply on your support request", "support", ["in_app", "email"]),
  "support.ticket_resolved": e("Support request resolved", "support", ["in_app", "email"]),
  "privacy.request_received": e("Data request received", "account", ["email", "in_app"], true),
  "privacy.request_completed": e("Data request completed", "account", ["email", "in_app"], true),

  // Approvals (staff + submitters)
  "approval.submitted": e("New item awaiting approval", "approvals", ["in_app"]),
  "approval.assigned": e("Approval assigned to you", "approvals", ["in_app", "email"]),
  "approval.decided": e("Your submission was reviewed", "approvals", ["in_app", "email"]),

  // Messages & announcements
  "message.received": e("New message", "messages", ["in_app", "email"]),
  "announcement.published": e("Announcement", "announcements", ["in_app"]),
} as const satisfies Record<string, EventDef>;

export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS;
