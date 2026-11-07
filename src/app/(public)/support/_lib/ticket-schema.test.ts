import { describe, expect, it } from "vitest";

import { formDataToObject } from "@/lib/actions";

import { formatHours } from "../../grievance/_components/officer-card";
import { guestContactErrors, publicTicketSchema } from "./ticket-schema";

function form(entries: Record<string, string>): Record<string, unknown> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return formDataToObject(fd);
}

describe("publicTicketSchema", () => {
  const base = { category: "grievance", subject: "Fee demand", message: "Someone asked me to pay for a job offer.", consentToContact: "true" };

  it("accepts a signed-in style submission without name or email", () => {
    const parsed = publicTicketSchema.safeParse(form(base));
    expect(parsed.success).toBe(true);
  });

  it("requires consent", () => {
    const parsed = publicTicketSchema.safeParse(form({ ...base, consentToContact: "" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((i) => i.path[0] === "consentToContact")).toBe(true);
  });

  it("accepts the honeypot without a validation error (the service drops it silently)", () => {
    const parsed = publicTicketSchema.safeParse(form({ ...base, website: "http://spam.example" }));
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown categories and short messages", () => {
    expect(publicTicketSchema.safeParse(form({ ...base, category: "free_money" })).success).toBe(false);
    expect(publicTicketSchema.safeParse(form({ ...base, message: "short" })).success).toBe(false);
  });

  it("drops an invalid locale instead of failing", () => {
    const parsed = publicTicketSchema.safeParse(form({ ...base, locale: "<script>" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.locale).toBeUndefined();
  });
});

describe("guestContactErrors", () => {
  it("asks guests for a name and an email", () => {
    expect(guestContactErrors({ name: undefined, email: undefined })).toEqual({ name: ["Enter your name"], email: ["Enter your email address so we can reply"] });
    expect(guestContactErrors({ name: "Asha", email: "asha@example.org" })).toBeNull();
  });
});

describe("formatHours", () => {
  it("uses days for whole days and hours otherwise", () => {
    expect(formatHours(24)).toBe("1 day");
    expect(formatHours(48)).toBe("2 days");
    expect(formatHours(36)).toBe("36 hours");
    expect(formatHours(1)).toBe("1 hour");
    expect(formatHours(0)).toBe("");
    expect(formatHours(Number.NaN)).toBe("");
  });
});
