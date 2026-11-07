/** Zod schemas for privacy forms and actions (client-safe). */
import { z } from "zod";

import { f } from "@/lib/validation";

import { DATA_REQUEST_STATUS_VALUES, DATA_REQUEST_TYPE_VALUES, GUEST_REQUEST_TYPES, SELF_SERVICE_REQUEST_TYPES } from "./constants";

const honeypot = z.string().max(0, "Leave this field empty").optional();

export const myDataRequestSchema = z
  .object({
    type: z.enum(SELF_SERVICE_REQUEST_TYPES, { error: "Choose a request type" }),
    details: f.longText(4000),
    confirmDeletion: f.bool(),
  })
  .refine((v) => v.type !== "correction" || Boolean(v.details && v.details.length >= 10), {
    path: ["details"],
    message: "Tell us what needs correcting (at least 10 characters)",
  })
  .refine((v) => v.type !== "deletion" || v.confirmDeletion, {
    path: ["confirmDeletion"],
    message: "Confirm that you understand your account will be closed",
  });
export type MyDataRequestInput = z.output<typeof myDataRequestSchema>;

export const guestDataRequestSchema = z.object({
  name: f.text({ label: "Your name", max: 120 }),
  email: f.email(),
  phone: f.optionalPhone(),
  type: z.enum(GUEST_REQUEST_TYPES, { error: "Choose a request type" }),
  details: f.text({ label: "Details", min: 10, max: 4000 }),
  website: honeypot,
});
export type GuestDataRequestInput = z.output<typeof guestDataRequestSchema>;

export const guestVerifySchema = z.object({
  code: z.string().trim().min(4, "Enter the code from the email").max(64),
  email: f.email(),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const dataRequestIdSchema = z.object({ id: f.uuid() });

export const staffVerifyIdentitySchema = z.object({ id: f.uuid(), note: f.text({ label: "How identity was verified", min: 5, max: 1000 }) });

export const staffAssignSchema = z.object({ id: f.uuid(), assigneeUserId: f.optionalUuid() });

export const staffCompleteSchema = z.object({
  id: f.uuid(),
  resolution: f.text({ label: "Resolution for the requester", min: 10, max: 4000 }),
  retentionExceptions: f.longText(4000),
});

export const staffRejectSchema = z.object({ id: f.uuid(), reason: f.text({ label: "Reason for the requester", min: 10, max: 4000 }) });

export const staffEraseSchema = z.object({
  id: f.uuid(),
  confirm: z.literal("ERASE", { error: "Type ERASE to confirm" }),
  retentionExceptions: f.longText(4000),
});

export const staffDataRequestFiltersSchema = z.object({
  status: z.union([z.enum(DATA_REQUEST_STATUS_VALUES), z.enum(["open", "closed"])]).optional().catch(undefined),
  type: z.enum(DATA_REQUEST_TYPE_VALUES).optional().catch(undefined),
  sla: z.enum(["overdue", "due_soon"]).optional().catch(undefined),
  assigned: z.enum(["me", "unassigned"]).optional().catch(undefined),
  q: z.string().trim().max(120).optional().catch(undefined),
});
export type StaffDataRequestFilters = z.output<typeof staffDataRequestFiltersSchema>;
