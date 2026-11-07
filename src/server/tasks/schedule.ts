import type { RecurringTask } from "./types";

/**
 * Recurring tasks. The scheduler enqueues each type once per interval (dedupe key =
 * `${type}:${bucket}`), then the processor runs them via the handler registry.
 * The owning module implements the handler in its tasks.ts under exactly this type name.
 */
export const RECURRING_TASKS: RecurringTask[] = [
  { type: "identity.cleanup", everyMinutes: 60, description: "Delete expired sessions and verification tokens" },
  { type: "system.cleanup", everyMinutes: 1440, description: "Purge expired rate-limit buckets, old dev outbox and finished tasks" },
  { type: "content.publish_scheduled", everyMinutes: 5, description: "Publish/expire scheduled CMS entries and announcements" },
  { type: "jobs.close_expired", everyMinutes: 60, description: "Close job postings past their deadline" },
  { type: "jobs.alerts_digest", everyMinutes: 1440, description: "Send job-alert digests to candidates" },
  { type: "recruitment.interview_reminders", everyMinutes: 15, description: "Send interview reminders" },
  { type: "recruitment.expire_offers", everyMinutes: 60, description: "Expire offers past their response deadline" },
  { type: "recruitment.expire_attributions", everyMinutes: 1440, description: "Expire partner candidate attributions past their window" },
  { type: "recruitment.expire_unlocks", everyMinutes: 60, description: "Withdraw employer file access when a profile unlock lapses" },
  { type: "operations.reminders", everyMinutes: 30, description: "Remind staff of due tasks and lead follow-ups" },
  { type: "commercial.renewals", everyMinutes: 1440, description: "Renewal reminders, expire lapsed subscriptions, expire credits" },
  { type: "analytics.aggregate", everyMinutes: 60, description: "Roll up analytics events into daily metrics" },
  { type: "analytics.retention", everyMinutes: 1440, description: "Delete analytics data past its retention period" },
  { type: "privacy.sla_watch", everyMinutes: 1440, description: "Alert on data-subject requests approaching their deadline" },
  { type: "support.sla_watch", everyMinutes: 60, description: "Flag tickets breaching SLA and escalate grievances" },
  { type: "organizations.verification_expiry", everyMinutes: 1440, description: "Expire lapsed verifications/licences and warn before expiry" },
  { type: "training.batch_reminders", everyMinutes: 1440, description: "Remind enrolled candidates about upcoming batches and assessments" },
];
