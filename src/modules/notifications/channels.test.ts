import { describe, expect, it } from "vitest";

import {
  allowsUnverifiedContact,
  categoryChannelDefault,
  decideChannel,
  getEventMeta,
  hasSecretLink,
  lockedEventsFor,
  resolveChannelsForRecipient,
  type ChannelFlags,
  type RecipientFacts,
} from "./channels";

const ALL_ON: ChannelFlags = { email: true, sms: true, whatsapp: true };
const DEFAULT_FLAGS: ChannelFlags = { email: true, sms: false, whatsapp: false };

const user = (over: Partial<Extract<RecipientFacts, { kind: "user" }>> = {}): RecipientFacts => ({
  kind: "user",
  active: true,
  email: "person@example.test",
  emailVerified: true,
  phone: "+919876543210",
  phoneVerified: true,
  whatsappConsent: true,
  ...over,
});

const statusChanged = getEventMeta("application.status_changed"); // non-mandatory, applications
const passwordChanged = getEventMeta("account.password_changed"); // mandatory, account
const invoiceIssued = getEventMeta("billing.invoice_issued"); // mandatory, billing
const interview = getEventMeta("interview.scheduled"); // in_app + email + sms

describe("decideChannel — in_app", () => {
  it("always delivers to active user recipients", () => {
    expect(decideChannel({ channel: "in_app", event: statusChanged, recipient: user(), flags: DEFAULT_FLAGS })).toEqual({ action: "send", address: null });
  });
  it("respects an opt-out for non-mandatory events only", () => {
    expect(decideChannel({ channel: "in_app", event: statusChanged, recipient: user(), preference: false, flags: DEFAULT_FLAGS })).toEqual({ action: "skip", reason: "opted_out" });
    expect(decideChannel({ channel: "in_app", event: invoiceIssued, recipient: user(), preference: false, flags: DEFAULT_FLAGS })).toEqual({ action: "send", address: null });
  });
  it("does not apply to raw email / phone recipients", () => {
    expect(decideChannel({ channel: "in_app", event: statusChanged, recipient: { kind: "email", email: "a@b.test" }, flags: DEFAULT_FLAGS })).toEqual({ action: "ignore" });
    expect(decideChannel({ channel: "in_app", event: statusChanged, recipient: { kind: "phone", phone: "+15550001111" }, flags: DEFAULT_FLAGS })).toEqual({ action: "ignore" });
  });
  it("skips suspended or closed accounts", () => {
    expect(decideChannel({ channel: "in_app", event: passwordChanged, recipient: user({ active: false }), flags: DEFAULT_FLAGS })).toEqual({ action: "skip", reason: "recipient_inactive" });
  });
});

describe("decideChannel — email", () => {
  it("is switched off by the notifications.email flag, even for mandatory events", () => {
    expect(decideChannel({ channel: "email", event: passwordChanged, recipient: user(), flags: { ...DEFAULT_FLAGS, email: false } })).toEqual({ action: "skip", reason: "channel_disabled" });
  });
  it("sends to verified addresses and respects opt-outs unless mandatory", () => {
    expect(decideChannel({ channel: "email", event: statusChanged, recipient: user(), flags: DEFAULT_FLAGS })).toEqual({ action: "send", address: "person@example.test" });
    expect(decideChannel({ channel: "email", event: statusChanged, recipient: user(), preference: false, flags: DEFAULT_FLAGS })).toEqual({ action: "skip", reason: "opted_out" });
    expect(decideChannel({ channel: "email", event: invoiceIssued, recipient: user(), preference: false, flags: DEFAULT_FLAGS })).toEqual({ action: "send", address: "person@example.test" });
  });
  it("uses unverified addresses only for mandatory account / verification events", () => {
    const unverified = user({ emailVerified: false });
    expect(decideChannel({ channel: "email", event: statusChanged, recipient: unverified, flags: DEFAULT_FLAGS })).toEqual({ action: "skip", reason: "no_address" });
    expect(decideChannel({ channel: "email", event: invoiceIssued, recipient: unverified, flags: DEFAULT_FLAGS })).toEqual({ action: "skip", reason: "no_address" });
    expect(decideChannel({ channel: "email", event: passwordChanged, recipient: unverified, flags: DEFAULT_FLAGS })).toEqual({ action: "send", address: "person@example.test" });
    expect(decideChannel({ channel: "email", event: getEventMeta("org.verification_approved"), recipient: unverified, flags: DEFAULT_FLAGS })).toMatchObject({ action: "send" });
  });
  it("reports a missing address", () => {
    expect(decideChannel({ channel: "email", event: statusChanged, recipient: user({ email: null }), flags: DEFAULT_FLAGS })).toEqual({ action: "skip", reason: "no_address" });
  });
  it("reaches inactive accounts only with mandatory account messages", () => {
    const closed = user({ active: false });
    expect(decideChannel({ channel: "email", event: getEventMeta("account.closed"), recipient: closed, flags: DEFAULT_FLAGS })).toMatchObject({ action: "send" });
    expect(decideChannel({ channel: "email", event: invoiceIssued, recipient: closed, flags: DEFAULT_FLAGS })).toEqual({ action: "skip", reason: "recipient_inactive" });
  });
  it("always sends to raw email recipients and ignores raw phone recipients", () => {
    expect(decideChannel({ channel: "email", event: statusChanged, recipient: { kind: "email", email: "guest@example.test" }, flags: DEFAULT_FLAGS })).toEqual({ action: "send", address: "guest@example.test" });
    expect(decideChannel({ channel: "email", event: statusChanged, recipient: { kind: "phone", phone: "+15550001111" }, flags: DEFAULT_FLAGS })).toEqual({ action: "ignore" });
  });
});

describe("decideChannel — sms", () => {
  it("needs the notifications.sms flag", () => {
    expect(decideChannel({ channel: "sms", event: interview, recipient: user(), flags: DEFAULT_FLAGS })).toEqual({ action: "skip", reason: "channel_disabled" });
    expect(decideChannel({ channel: "sms", event: interview, recipient: user(), flags: ALL_ON })).toEqual({ action: "send", address: "+919876543210" });
  });
  it("needs a verified phone and always honours opt-outs", () => {
    expect(decideChannel({ channel: "sms", event: interview, recipient: user({ phoneVerified: false }), flags: ALL_ON })).toEqual({ action: "skip", reason: "no_address" });
    expect(decideChannel({ channel: "sms", event: invoiceIssued, recipient: user(), preference: false, flags: ALL_ON })).toEqual({ action: "skip", reason: "opted_out" });
  });
  it("sends to raw phone recipients and ignores raw email recipients", () => {
    expect(decideChannel({ channel: "sms", event: interview, recipient: { kind: "phone", phone: "+15550001111" }, flags: ALL_ON })).toEqual({ action: "send", address: "+15550001111" });
    expect(decideChannel({ channel: "sms", event: interview, recipient: { kind: "email", email: "a@b.test" }, flags: ALL_ON })).toEqual({ action: "ignore" });
  });
});

describe("decideChannel — whatsapp", () => {
  const args = { channel: "whatsapp" as const, event: interview, flags: ALL_ON, hasWhatsAppTemplate: true };
  it("needs the flag, a verified phone, consent and an approved template", () => {
    expect(decideChannel({ ...args, recipient: user(), flags: DEFAULT_FLAGS })).toEqual({ action: "skip", reason: "channel_disabled" });
    expect(decideChannel({ ...args, recipient: user({ phone: null }) })).toEqual({ action: "skip", reason: "no_address" });
    expect(decideChannel({ ...args, recipient: user({ whatsappConsent: false }) })).toEqual({ action: "skip", reason: "no_consent" });
    expect(decideChannel({ ...args, recipient: user(), hasWhatsAppTemplate: false })).toEqual({ action: "skip", reason: "no_template" });
    expect(decideChannel({ ...args, recipient: user() })).toEqual({ action: "send", address: "+919876543210" });
  });
  it("never messages raw phone numbers (no consent on record)", () => {
    expect(decideChannel({ ...args, recipient: { kind: "phone", phone: "+15550001111" } })).toEqual({ action: "skip", reason: "no_consent" });
  });
  it("honours opt-outs even for mandatory events", () => {
    expect(decideChannel({ ...args, event: invoiceIssued, recipient: user(), preference: false })).toEqual({ action: "skip", reason: "opted_out" });
  });
});

describe("resolveChannelsForRecipient", () => {
  it("uses the event defaults plus explicit opt-ins for users", () => {
    expect(resolveChannelsForRecipient({ event: statusChanged, recipient: user() })).toEqual(["in_app", "email"]);
    expect(resolveChannelsForRecipient({ event: statusChanged, recipient: user(), preferences: { sms: true } })).toEqual(["in_app", "email", "sms"]);
  });
  it("keeps an explicit channel override strict", () => {
    expect(resolveChannelsForRecipient({ event: statusChanged, override: ["in_app"], recipient: user(), preferences: { sms: true } })).toEqual(["in_app"]);
  });
  it("ignores preferences for raw recipients", () => {
    expect(resolveChannelsForRecipient({ event: interview, recipient: { kind: "email", email: "a@b.test" }, preferences: { whatsapp: true } })).toEqual(["in_app", "email", "sms"]);
  });
});

describe("preference matrix helpers", () => {
  it("defaults a cell on when any event of the category uses the channel", () => {
    expect(categoryChannelDefault("applications", "email")).toBe(true);
    expect(categoryChannelDefault("applications", "sms")).toBe(false);
    expect(categoryChannelDefault("interviews", "sms")).toBe(true);
  });
  it("locks mandatory events on for email and in-app only", () => {
    expect(lockedEventsFor("account", "email").map((e) => e.key)).toContain("account.password_changed");
    expect(lockedEventsFor("account", "sms")).toEqual([]);
    expect(lockedEventsFor("job_alerts", "email")).toEqual([]);
  });
  it("allows unverified contacts only for mandatory account / verification events", () => {
    expect(allowsUnverifiedContact(getEventMeta("account.security_alert"))).toBe(true);
    expect(allowsUnverifiedContact(getEventMeta("org.invitation"))).toBe(true);
    expect(allowsUnverifiedContact(getEventMeta("billing.invoice_issued"))).toBe(false);
    expect(allowsUnverifiedContact(getEventMeta("account.welcome"))).toBe(false);
  });
});

describe("hasSecretLink", () => {
  it("marks only events whose link carries a single-use secret", () => {
    expect(hasSecretLink("org.invitation")).toBe(true);
    expect(hasSecretLink("job.approved")).toBe(false);
    expect(hasSecretLink(undefined)).toBe(false);
  });
});
