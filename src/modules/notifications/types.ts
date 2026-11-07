/**
 * Notifications module types (client-safe DTOs shared by queries, actions, route handlers and components).
 */
import type { NotificationDeliveryStatus, NotificationPreferenceSource, NotificationSkipReason } from "@/db/schema/notifications";

import type { NotificationCategory, NotificationChannel, NotificationEvent } from "./events";

export type NotificationListFilter = "all" | "unread" | "archived";

export type NotificationListFilters = {
  filter?: NotificationListFilter;
  category?: NotificationCategory;
  /** Only notifications of this workspace. */
  organizationId?: string;
};

/** One in-app notification (server shape: dates are Date objects). */
export type NotificationItem = {
  id: string;
  eventKey: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  link: string | null;
  organizationId: string | null;
  createdAt: Date;
  readAt: Date | null;
  archivedAt: Date | null;
};

/** Serialisable version for client components (ISO strings). */
export type NotificationListItem = {
  id: string;
  eventKey: string;
  category: NotificationCategory;
  categoryLabel: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
};

/** GET /api/v1/notifications/summary response (contract consumed by the notification bell). */
export type NotificationSummaryResponse = {
  unreadCount: number;
  items: { id: string; title: string; body: string | null; link: string | null; createdAt: string; readAt: string | null }[];
};

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export type PreferenceCell = {
  channel: NotificationChannel;
  /** Effective state shown in the form. */
  enabled: boolean;
  /** State with no stored preference (any event of the category uses the channel by default). */
  defaultEnabled: boolean;
  /** A stored preference differs from the default. */
  customised: boolean;
  /** Labels of mandatory events of the category that are always sent on this channel. */
  lockedEvents: string[];
};

export type PreferenceCategory = {
  category: NotificationCategory;
  label: string;
  description: string;
  cells: PreferenceCell[];
};

export type PreferenceChannelInfo = {
  channel: NotificationChannel;
  label: string;
  /** Why the channel may not deliver (e.g. no verified phone, WhatsApp consent missing). */
  note: string | null;
};

export type PreferenceMatrix = {
  channels: PreferenceChannelInfo[];
  categories: PreferenceCategory[];
};

export type PreferenceChange = { category: NotificationCategory; channel: NotificationChannel; enabled: boolean };

// ---------------------------------------------------------------------------
// Admin: templates and delivery log
// ---------------------------------------------------------------------------

export type TemplateOverrideSummary = {
  id: string;
  channel: NotificationChannel;
  locale: string;
  isActive: boolean;
  version: number;
  updatedAt: Date;
  updatedByName: string | null;
};

export type TemplateCatalogItem = {
  eventKey: NotificationEvent;
  label: string;
  category: NotificationCategory;
  mandatory: boolean;
  defaultChannels: NotificationChannel[];
  defaults: { subject: string; body: string; sms: string | null; cta: string | null };
  /** Keys the code default uses (for editors: what `data` provides). */
  placeholders: string[];
  overrides: TemplateOverrideSummary[];
};

export type TemplatePreview = {
  subject: string;
  text: string;
  /** Full email HTML (email channel) or the body fragment (other channels). */
  html: string;
  /** Placeholders used by the template that the sample data does not provide. */
  unknownPlaceholders: string[];
};

export type DeliveryLogItem = {
  id: string;
  eventKey: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  skipReason: NotificationSkipReason | null;
  recipient: string | null;
  userId: string | null;
  userName: string | null;
  locale: string | null;
  provider: string | null;
  attempts: number;
  lastError: string | null;
  templateId: string | null;
  templateVersion: number | null;
  createdAt: Date;
  sentAt: Date | null;
  failedAt: Date | null;
};

export type DeliveryStats = {
  since: Date;
  byStatus: Record<NotificationDeliveryStatus, number>;
  byChannel: Record<NotificationChannel, { sent: number; failed: number; skipped: number }>;
};

export type UnsubscribeResult = {
  category: NotificationCategory;
  categoryLabel: string;
  channel: NotificationChannel;
  alreadyUnsubscribed: boolean;
};

export type { NotificationPreferenceSource };
