import { describe, expect, it } from "vitest";

import { addOrganizationDocumentSchema } from "./schemas";

describe("addOrganizationDocumentSchema", () => {
  const messages = (input: Record<string, unknown>) => {
    const parsed = addOrganizationDocumentSchema.safeParse(input);
    return parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]));
  };

  it("asks for the file in plain English when none was uploaded (no raw validation text)", () => {
    const errors = messages({ orgType: "recruitment_partner", documentType: "registration_certificate" });
    expect(errors.fileId).toBe("Upload the document file");
    for (const message of Object.values(errors)) expect(message).not.toMatch(/invalid (identifier|input|option)|expected/i);
  });

  it("accepts an uploaded file", () => {
    expect(messages({ orgType: "recruitment_partner", documentType: "registration_certificate", fileId: "7d9f3c2a-1b4e-4c8d-9e0f-123456789abc" })).toEqual({});
  });
});
