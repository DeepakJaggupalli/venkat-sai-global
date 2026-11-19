/**
 * "Post a requirement" (/requirements/submit) — the public poster form (client-safe: the form, the route handler
 * and the service share it). The poster image travels next to these fields in the same multipart request (field
 * `poster`), or is referenced by a shared-upload token (field `shared`, from the Web Share Target).
 */
import { z } from "zod";

import { f } from "@/lib/validation";

const optionalBlank = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

export const POSTER_SUBMISSION_MAX_BYTES = 4 * 1024 * 1024;
export const POSTER_SUBMISSION_ACCEPT = "image/*";
export const POSTER_SUBMISSION_TYPES_LABEL = "JPG, PNG or WebP";
/** Raster images only (no SVG or PDF from the public). */
export const POSTER_SUBMISSION_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const publicPosterSubmissionSchema = z.object({
  companyName: f.text({ label: "Company name", max: 160 }),
  contactName: f.text({ label: "Your name", max: 120 }),
  phone: f.phone(),
  email: optionalBlank(z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"))),
  countryCode: optionalBlank(z.string().trim().length(2, "Choose a country").toUpperCase()),
  /** One trade per line, optionally "Trade - salary" ("Mechanical helper - 900 AED"). */
  trades: f.optionalText(4000),
  notes: f.optionalText(2000),
  /** Shared-upload token (Web Share Target / /share/choose) used instead of a new poster upload. */
  shared: optionalBlank(z.string().trim().max(200)),
  consentToContact: f.bool().refine((v) => v === true, { message: "Please agree that we may call or WhatsApp you about this requirement" }),
  /** Honeypot: accepted (never a validation error, so bots learn nothing); the service checks it. */
  website: z.string().max(500).optional(),
});
export type PublicPosterSubmissionInput = z.output<typeof publicPosterSubmissionSchema>;

export type PublicPosterSubmissionResult = {
  /** Reference code (null when dropped as spam: the visitor still sees the confirmation). */
  code: string | null;
  companyName: string;
};
