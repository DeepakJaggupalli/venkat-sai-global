/**
 * Channel decision rules for one recipient × channel (pure, client-safe; unit-tested in channels.test.ts).
 *
 *  in_app    user recipients only; skipped when the category is opted out and the event is not mandatory.
 *  email     needs the `notifications.email` flag and an address. User recipients need a verified address,
 *            except for mandatory account / verification events; non-mandatory events respect opt-outs.
 *  sms       needs the `notifications.sms` flag and a (verified) phone; opt-outs always apply.
 *  whatsapp  needs the `notifications.whatsapp` flag, a (verified) phone, the user's `whatsapp_updates`
 *            consent and an active WhatsApp template (pre-approved template name); opt-outs always apply.
 *
 * Suspended / closed accounts only receive mandatory account messages (e.g. "account closed"), and only by
 * email / SMS. Raw email / phone recipients (form submitters, invitees) have no preferences.
 */
import type { NotificationSkipReason } from "@/db/schema/notifications";

import { NOTIFICATION_EVENTS, type NotificationCategory, type NotificationChannel, type NotificationEvent } from "./events";

export const CHANNEL_ORDER: readonly NotificationChannel[] = ["in_app", "email", "sms", "whatsapp"];

export type EventMeta = {
  key: NotificationEvent;
  label: string;
  category: NotificationCategory;
  mandatory: boolean;
  defaultChannels: readonly NotificationChannel[];
};

export function isNotificationEvent(value: unknown): value is NotificationEvent {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(NOTIFICATION_EVENTS, value);
}

export function getEventMeta(event: NotificationEvent): EventMeta {
  const def = NOTIFICATION_EVENTS[event];
  return { key: event, label: def.label, category: def.category, mandatory: def.mandatory === true, defaultChannels: def.defaultChannels };
}

export function listEventMeta(): EventMeta[] {
  return (Object.keys(NOTIFICATION_EVENTS) as NotificationEvent[]).map(getEventMeta);
}

/**
 * Mandatory account and verification messages may go to an address that is not verified yet
 * (security alerts, password changes, organisation verification outcomes, invitations).
 */
export function allowsUnverifiedContact(event: Pick<EventMeta, "key" | "category" | "mandatory">): boolean {
  if (!event.mandatory) return false;
  return event.category === "account" || event.key.includes("verification") || event.key === "org.invitation";
}

/** Mandatory account messages still reach suspended / closed accounts (closure notices, security alerts). */
export function reachesInactiveAccounts(event: Pick<EventMeta, "category" | "mandatory">): boolean {
  return event.mandatory && event.category === "account";
}

const SECRET_LINK_EVENTS: ReadonlySet<string> = new Set<NotificationEvent>(["org.invitation"]);

/**
 * Events whose `link` carries a single-use secret (the invitation token). The dispatch tasks render with it and
 * then strip it from their stored payload, so the secret does not stay in background_jobs until cleanup.
 */
export function hasSecretLink(event: unknown): boolean {
  return typeof event === "string" && SECRET_LINK_EVENTS.has(event);
}

export type RecipientFacts =
  | {
      kind: "user";
      /** users.status === "active" or "pending_verification". */
      active: boolean;
      email: string | null;
      emailVerified: boolean;
      phone: string | null;
      phoneVerified: boolean;
      whatsappConsent: boolean;
    }
  | { kind: "email"; email: string }
  | { kind: "phone"; phone: string };

export type ChannelFlags = { email: boolean; sms: boolean; whatsapp: boolean };

export type ChannelDecision =
  | { action: "send"; address: string | null }
  | { action: "skip"; reason: NotificationSkipReason }
  /** The channel does not apply to this kind of recipient (no delivery row is written). */
  | { action: "ignore" };

/** Explicit per-category preference rows of one user (no entry = default). */
export type CategoryPreferences = Partial<Record<NotificationChannel, boolean>>;

/**
 * Channels to consider for a recipient: the caller's override, else the event defaults plus any channel the
 * user explicitly opted into for the category (opt-in rows are only stored when they differ from the default).
 */
export function resolveChannelsForRecipient(args: {
  event: EventMeta;
  override?: readonly NotificationChannel[] | null;
  recipient: RecipientFacts;
  preferences?: CategoryPreferences;
}): NotificationChannel[] {
  const base = new Set<NotificationChannel>(args.override?.length ? args.override : args.event.defaultChannels);
  if (!args.override?.length && args.recipient.kind === "user" && args.preferences) {
    for (const channel of CHANNEL_ORDER) if (args.preferences[channel] === true) base.add(channel);
  }
  return CHANNEL_ORDER.filter((c) => base.has(c));
}

export function decideChannel(args: {
  channel: NotificationChannel;
  event: EventMeta;
  recipient: RecipientFacts;
  /** Explicit preference for (event category, channel); undefined = no row. */
  preference?: boolean;
  flags: ChannelFlags;
  /** An active WhatsApp template (with a pre-approved template name) exists for the event. */
  hasWhatsAppTemplate?: boolean;
}): ChannelDecision {
  const { channel, event, recipient, preference, flags } = args;
  const optedOut = preference === false;
  const inactiveUser = recipient.kind === "user" && !recipient.active;

  switch (channel) {
    case "in_app": {
      if (recipient.kind !== "user") return { action: "ignore" };
      if (inactiveUser) return { action: "skip", reason: "recipient_inactive" };
      if (optedOut && !event.mandatory) return { action: "skip", reason: "opted_out" };
      return { action: "send", address: null };
    }
    case "email": {
      if (recipient.kind === "phone") return { action: "ignore" };
      if (!flags.email) return { action: "skip", reason: "channel_disabled" };
      if (recipient.kind === "email") return { action: "send", address: recipient.email };
      if (inactiveUser && !reachesInactiveAccounts(event)) return { action: "skip", reason: "recipient_inactive" };
      if (optedOut && !event.mandatory) return { action: "skip", reason: "opted_out" };
      if (!recipient.email || (!recipient.emailVerified && !allowsUnverifiedContact(event))) return { action: "skip", reason: "no_address" };
      return { action: "send", address: recipient.email };
    }
    case "sms": {
      if (recipient.kind === "email") return { action: "ignore" };
      if (!flags.sms) return { action: "skip", reason: "channel_disabled" };
      if (recipient.kind === "phone") return { action: "send", address: recipient.phone };
      if (inactiveUser && !reachesInactiveAccounts(event)) return { action: "skip", reason: "recipient_inactive" };
      if (optedOut) return { action: "skip", reason: "opted_out" };
      if (!recipient.phone || (!recipient.phoneVerified && !allowsUnverifiedContact(event))) return { action: "skip", reason: "no_address" };
      return { action: "send", address: recipient.phone };
    }
    case "whatsapp": {
      if (recipient.kind === "email") return { action: "ignore" };
      if (!flags.whatsapp) return { action: "skip", reason: "channel_disabled" };
      if (recipient.kind === "phone") return { action: "skip", reason: "no_consent" };
      if (inactiveUser) return { action: "skip", reason: "recipient_inactive" };
      if (optedOut) return { action: "skip", reason: "opted_out" };
      if (!recipient.phone || !recipient.phoneVerified) return { action: "skip", reason: "no_address" };
      if (!recipient.whatsappConsent) return { action: "skip", reason: "no_consent" };
      if (!args.hasWhatsAppTemplate) return { action: "skip", reason: "no_template" };
      return { action: "send", address: recipient.phone };
    }
  }
}

// ---------------------------------------------------------------------------
// Preference matrix helpers (category × channel)
// ---------------------------------------------------------------------------

export function eventsInCategory(category: NotificationCategory): EventMeta[] {
  return listEventMeta().filter((e) => e.category === category);
}

/** Default state of a preference cell: on when any event of the category uses the channel by default. */
export function categoryChannelDefault(category: NotificationCategory, channel: NotificationChannel): boolean {
  return eventsInCategory(category).some((e) => e.defaultChannels.includes(channel));
}

/** Mandatory events of a category that ignore opt-outs on this channel (only in-app and email are locked on). */
export function lockedEventsFor(category: NotificationCategory, channel: NotificationChannel): EventMeta[] {
  if (channel !== "in_app" && channel !== "email") return [];
  return eventsInCategory(category).filter((e) => e.mandatory && e.defaultChannels.includes(channel));
}
