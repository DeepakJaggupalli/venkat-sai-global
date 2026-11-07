import { describe, expect, it } from "vitest";

import {
  ENQUIRY_STATUSES,
  ENQUIRY_TYPES,
  GRIEVANCE_TYPES,
  INTERNAL_NOTE_VISIBILITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_TYPES,
  MESSAGE_THREAD_CONTEXT_TYPES,
  REQUIREMENT_INTERVIEW_METHODS,
  REQUIREMENT_KINDS,
  REQUIREMENT_STATUSES,
  REQUIREMENT_URGENCIES,
  STAFF_TASK_PRIORITIES,
  STAFF_TASK_STATUSES,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_CHANNELS,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
} from "@/db/schema/operations";

import {
  canTransition,
  ENQUIRY_STATUS_VALUES,
  ENQUIRY_TRANSITIONS,
  ENQUIRY_TYPE_VALUES,
  GRIEVANCE_TYPE_VALUES,
  LEAD_SOURCE_VALUES,
  LEAD_STATUS_VALUES,
  LEAD_TRANSITIONS,
  LEAD_TYPE_VALUES,
  NOTE_VISIBILITY_VALUES,
  REQUIREMENT_INTERVIEW_METHOD_VALUES,
  REQUIREMENT_KIND_VALUES,
  REQUIREMENT_STAFF_TRANSITIONS,
  REQUIREMENT_STATUS_VALUES,
  REQUIREMENT_URGENCY_VALUES,
  STAFF_TASK_PRIORITY_VALUES,
  STAFF_TASK_STATUS_VALUES,
  STAFF_TASK_TRANSITIONS,
  THREAD_CONTEXT_VALUES,
  TICKET_CATEGORY_VALUES,
  TICKET_CHANNEL_VALUES,
  TICKET_PRIORITY_VALUES,
  TICKET_STAFF_TRANSITIONS,
  TICKET_STATUS_VALUES,
} from "./constants";
import { publicEnquirySchema, publicRequirementSchema } from "./schemas";

const sorted = (values: readonly string[]) => [...values].sort();

describe("client-safe value lists match the schema enums", () => {
  it.each([
    [LEAD_TYPE_VALUES, LEAD_TYPES],
    [LEAD_SOURCE_VALUES, LEAD_SOURCES],
    [LEAD_STATUS_VALUES, LEAD_STATUSES],
    [ENQUIRY_TYPE_VALUES, ENQUIRY_TYPES],
    [ENQUIRY_STATUS_VALUES, ENQUIRY_STATUSES],
    [REQUIREMENT_KIND_VALUES, REQUIREMENT_KINDS],
    [REQUIREMENT_STATUS_VALUES, REQUIREMENT_STATUSES],
    [REQUIREMENT_URGENCY_VALUES, REQUIREMENT_URGENCIES],
    [REQUIREMENT_INTERVIEW_METHOD_VALUES, REQUIREMENT_INTERVIEW_METHODS],
    [TICKET_CATEGORY_VALUES, SUPPORT_TICKET_CATEGORIES],
    [TICKET_PRIORITY_VALUES, SUPPORT_TICKET_PRIORITIES],
    [TICKET_STATUS_VALUES, SUPPORT_TICKET_STATUSES],
    [TICKET_CHANNEL_VALUES, SUPPORT_TICKET_CHANNELS],
    [GRIEVANCE_TYPE_VALUES, GRIEVANCE_TYPES],
    [STAFF_TASK_STATUS_VALUES, STAFF_TASK_STATUSES],
    [STAFF_TASK_PRIORITY_VALUES, STAFF_TASK_PRIORITIES],
    [NOTE_VISIBILITY_VALUES, INTERNAL_NOTE_VISIBILITIES],
    [THREAD_CONTEXT_VALUES, MESSAGE_THREAD_CONTEXT_TYPES],
  ])("%j", (values, schemaValues) => {
    expect(sorted(values)).toEqual(sorted(schemaValues));
  });
});

describe("state machines", () => {
  it("only reference known states and never allow staying put", () => {
    const machines: Record<string, Record<string, readonly string[]>> = {
      lead: LEAD_TRANSITIONS,
      enquiry: ENQUIRY_TRANSITIONS,
      requirement: REQUIREMENT_STAFF_TRANSITIONS,
      ticket: TICKET_STAFF_TRANSITIONS,
      task: STAFF_TASK_TRANSITIONS,
    };
    for (const machine of Object.values(machines)) {
      const states = Object.keys(machine);
      for (const [from, targets] of Object.entries(machine)) {
        for (const to of targets) {
          expect(states).toContain(to);
          expect(to).not.toBe(from);
        }
      }
    }
  });

  it("only lets staff return an on-hold requirement to approved (first approval happens in the approval centre)", () => {
    const into = Object.entries(REQUIREMENT_STAFF_TRANSITIONS)
      .filter(([, targets]) => targets.includes("approved"))
      .map(([from]) => from);
    expect(into).toEqual(["on_hold"]);
    expect(canTransition(REQUIREMENT_STAFF_TRANSITIONS, "submitted", "approved")).toBe(false);
    expect(canTransition(REQUIREMENT_STAFF_TRANSITIONS, "under_review", "approved")).toBe(false);
  });

  it("keeps cancelled and closed requirements terminal", () => {
    expect(REQUIREMENT_STAFF_TRANSITIONS.cancelled).toEqual([]);
    expect(REQUIREMENT_STAFF_TRANSITIONS.closed).toEqual([]);
  });
});

describe("public form schemas", () => {
  it("require consent and a way to reply, and accept (but do not reject) the honeypot field", () => {
    const base = { name: "Test sender", email: "sender@example.test", message: "We would like to discuss hiring." };
    expect(publicEnquirySchema.safeParse({ ...base }).success).toBe(false);
    expect(publicEnquirySchema.safeParse({ ...base, consentToContact: "on" }).success).toBe(true);
    expect(publicEnquirySchema.safeParse({ ...base, email: undefined, consentToContact: "on" }).success).toBe(false);
    expect(publicEnquirySchema.safeParse({ ...base, consentToContact: "on", website: "http://spam.test" }).success).toBe(true);
  });

  it("validate requirement lines (salary needs currency + period, min ≤ max)", () => {
    const base = {
      organizationName: "Sample organisation",
      contactName: "Contact",
      contactEmail: "contact@example.test",
      title: "Welders for a project",
      consentToContact: "on",
    };
    const line = { roleTitle: "TIG welder", positions: 10 };
    expect(publicRequirementSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(publicRequirementSchema.safeParse({ ...base, lines: [line] }).success).toBe(true);
    expect(publicRequirementSchema.safeParse({ ...base, lines: [{ ...line, salaryMin: 1000 }] }).success).toBe(false);
    expect(publicRequirementSchema.safeParse({ ...base, lines: [{ ...line, salaryMin: 3000, salaryMax: 1000, salaryCurrency: "AED", salaryPeriod: "month" }] }).success).toBe(false);
    expect(publicRequirementSchema.safeParse({ ...base, lines: [{ ...line, salaryMin: 1000, salaryMax: 3000, salaryCurrency: "aed", salaryPeriod: "month" }] }).success).toBe(true);
  });
});
