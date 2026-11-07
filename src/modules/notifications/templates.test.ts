import { describe, expect, it } from "vitest";

import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from "@/db/schema/notifications";

import { NOTIFICATION_CATEGORY_KEYS, NOTIFICATION_CHANNEL_KEYS } from "./catalog";
import { NOTIFICATION_EVENTS, type NotificationEvent } from "./events";
import { renderPlainText, renderSubject, renderTemplate } from "./render";
import { DEFAULT_TEMPLATES, getDefaultTemplate } from "./templates";

const ctx = { timeZone: "Asia/Kolkata", locale: "en", appUrl: "https://app.example.test" };
const events = Object.keys(NOTIFICATION_EVENTS) as NotificationEvent[];

describe("default templates", () => {
  it("exist for every event in events.ts", () => {
    const missing = events.filter((e) => !DEFAULT_TEMPLATES[e]);
    expect(missing).toEqual([]);
  });

  it("have no templates for events that no longer exist", () => {
    const stale = Object.keys(DEFAULT_TEMPLATES).filter((k) => !(k in NOTIFICATION_EVENTS));
    expect(stale).toEqual([]);
  });

  it.each(events)("%s renders a subject and body with its sample data", (event) => {
    const t = getDefaultTemplate(event);
    const values = { ...t.sample, recipientName: "Recipient name", link: "https://app.example.test/x" };
    const out = renderTemplate({ subject: t.subject, body: t.body }, values, ctx);
    expect(out.subject.length).toBeGreaterThan(3);
    expect(out.text.length).toBeGreaterThan(3);
    expect(out.subject).not.toMatch(/\{\{|\}\}/);
    expect(out.text).not.toMatch(/\{\{|\}\}/);
    if (t.sms) expect(renderPlainText(t.sms, values, ctx)).not.toMatch(/\{\{|\}\}/);
  });

  it.each(events)("%s still reads well with no data at all", (event) => {
    const t = getDefaultTemplate(event);
    expect(renderSubject(t.subject, {}, ctx)).not.toMatch(/\{\{|\}\}|\s{2}/);
  });

  it("follows the copy rules (no exclamation marks, no fee requests)", () => {
    for (const event of events) {
      const t = getDefaultTemplate(event);
      expect(`${t.subject} ${t.body} ${t.sms ?? ""}`).not.toMatch(/!/);
    }
  });

  it("switch audience-aware templates with forStaff", () => {
    const t = getDefaultTemplate("support.ticket_created");
    expect(renderSubject(t.subject, { code: "VSG-TKT-1", forStaff: true }, ctx)).toBe("New support request VSG-TKT-1");
    expect(renderSubject(t.subject, { code: "VSG-TKT-1" }, ctx)).toBe("We received your support request VSG-TKT-1");
  });
});

describe("client-safe enum copies", () => {
  it("match the schema enums", () => {
    expect([...NOTIFICATION_CATEGORY_KEYS].sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
    expect([...NOTIFICATION_CHANNEL_KEYS].sort()).toEqual([...NOTIFICATION_CHANNELS].sort());
  });
});
