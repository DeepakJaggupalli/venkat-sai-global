import { describe, expect, it } from "vitest";

import { resumeRequestSchema } from "./schemas";

/** The public form sends every field inside the `details` JSON, so blank inputs arrive as "" (not left out). */
function errorsFor(details: Record<string, unknown>): Record<string, string[]> {
  const parsed = resumeRequestSchema.safeParse({ details: JSON.stringify(details), consentToContact: "on" });
  if (parsed.success) return {};
  const out: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) (out[issue.path.join(".")] ??= []).push(issue.message);
  return out;
}

describe("resumeRequestSchema", () => {
  it("asks for a missing phone number instead of calling a blank one invalid", () => {
    expect(errorsFor({ postAppliedFor: "TIG welder", name: "Ravi", contactPhone: "" })["details.contactPhone"]).toEqual(["Phone number is required"]);
    expect(errorsFor({ postAppliedFor: "TIG welder", name: "Ravi", contactPhone: "12" })["details.contactPhone"]).toEqual(["Enter a valid phone number with country code"]);
  });

  it("accepts a complete minimal request and normalises the phone", () => {
    const parsed = resumeRequestSchema.safeParse({ details: JSON.stringify({ postAppliedFor: "TIG welder", name: "Ravi", contactPhone: "98765 43210" }), consentToContact: "on" });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.details.contactPhone).toBe("+919876543210");
  });

  it("treats unreadable details as missing, not as a crash", () => {
    const parsed = resumeRequestSchema.safeParse({ details: "{not json", consentToContact: "on" });
    expect(parsed.success).toBe(false);
  });
});
