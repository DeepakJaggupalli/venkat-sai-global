/**
 * Zod schemas for recruitment inputs (client-safe: forms and actions share them).
 * Services parse their input with the same schemas, so they are safe to call from any module.
 * Money is always minor units + an ISO currency; dates are "YYYY-MM-DD"; interview times are a
 * wall-clock "YYYY-MM-DDTHH:mm" plus an IANA time zone.
 */
import { z } from "zod";

import { SALARY_PERIODS } from "@/db/schema/_constants";
import {
  ATTRIBUTION_STATUS_OPTIONS,
  CHECKLIST_CATEGORY_OPTIONS,
  EMIGRATION_CLEARANCE_OPTIONS,
  INTERVIEW_MODE_OPTIONS,
  INTERVIEW_OUTCOME_OPTIONS,
  INTERVIEW_RESPONSE_OPTIONS,
  MEDICAL_STATUS_OPTIONS,
  MOBILISATION_STATUS_OPTIONS,
  NOTE_VISIBILITY_OPTIONS,
  PARTICIPANT_ROLE_OPTIONS,
  RECOMMENDATION_OPTIONS,
  REJECTION_REASON_OPTIONS,
  RESPONSIBLE_PARTY_OPTIONS,
  TALENT_LIST_KIND_OPTIONS,
  VISA_STATUS_OPTIONS,
} from "./constants";

const uuid = () => z.uuid("Invalid identifier");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const requiredText = (max: number, label = "This field") => z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, "Too long");
const dateString = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
const optionalDate = () => dateString().optional().nullable().transform((v) => v ?? null);
/** Partial updates: undefined = keep the current value, null / "" = clear it. */
const patchText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));
const patchDate = () =>
  dateString()
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v));
const currency = () => z.string().trim().length(3, "Choose a currency").toUpperCase();
const country = () => z.string().trim().length(2, "Choose a country").toUpperCase();
const minor = () => z.number().int("Amounts are whole minor units").nonnegative("Amount cannot be negative").max(Number.MAX_SAFE_INTEGER);

/** Ways consent can be captured on someone's behalf (staff assignment, partner submission). */
export const CONSENT_CAPTURE_METHODS = ["written", "electronic", "verbal", "in_person"] as const;
export type ConsentCaptureMethod = (typeof CONSENT_CAPTURE_METHODS)[number];

/** Sources staff may record when assigning a candidate (partner applications come from submissions). */
export const STAFF_APPLICATION_SOURCES = ["staff_assigned", "referral", "campus", "import"] as const;
export type StaffApplicationSource = (typeof STAFF_APPLICATION_SOURCES)[number];

export const expectedSalarySchema = z
  .object({ amountMinor: minor(), currency: currency(), period: z.enum(SALARY_PERIODS) })
  .nullable()
  .optional()
  .transform((v) => v ?? null);
export type ExpectedSalaryInput = { amountMinor: number; currency: string; period: (typeof SALARY_PERIODS)[number] };

const answersSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .transform((v) => v ?? {});

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export const candidateApplySchema = z.object({
  jobId: uuid(),
  coverLetter: optionalText(5000),
  /** A resume uploaded for this application (purpose "resume", owned by the candidate). Default: the profile resume. */
  resumeFileId: uuid().optional().nullable().transform((v) => v ?? null),
  /** questionId → answer (string | number | boolean | string[]). */
  answers: answersSchema,
  expectedSalary: expectedSalarySchema,
  consentToShare: z.literal(true, { error: "Please agree to share your profile with the employer to apply." }),
});
export type CandidateApplyInput = z.input<typeof candidateApplySchema>;

/**
 * FormData version of the apply form: `answers:json` holds the screening answers, the expected
 * salary is typed as a decimal amount (converted to minor units of the chosen currency by the action)
 * and consent is a checkbox.
 */
export const candidateApplyFormSchema = z
  .object({
    jobId: uuid(),
    coverLetter: optionalText(5000),
    resumeFileId: uuid().optional().nullable().transform((v) => v ?? null),
    answers: answersSchema,
    expectedSalaryAmount: z.coerce.number({ error: "Enter an amount" }).nonnegative("Amount cannot be negative").optional(),
    expectedSalaryCurrency: currency().optional(),
    expectedSalaryPeriod: z.enum(SALARY_PERIODS).optional(),
    consentToShare: z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.literal(true, { error: "Please agree to share your profile with the employer to apply." })),
  })
  .refine((v) => v.expectedSalaryAmount === undefined || (v.expectedSalaryCurrency && v.expectedSalaryPeriod), {
    message: "Choose a currency and a period for the expected salary",
    path: ["expectedSalaryCurrency"],
  });

export const staffAssignSchema = z.object({
  jobId: uuid(),
  candidateId: uuid(),
  source: z.enum(STAFF_APPLICATION_SOURCES).default("staff_assigned"),
  sourceDetails: z
    .object({
      campusDriveId: uuid().optional(),
      referrerName: z.string().trim().max(200).optional(),
      referrerUserId: uuid().optional(),
      importBatchId: z.string().trim().max(100).optional(),
    })
    .optional()
    .transform((v) => v ?? {}),
  coverLetter: optionalText(5000),
  resumeFileId: uuid().optional().nullable().transform((v) => v ?? null),
  answers: answersSchema,
  expectedSalary: expectedSalarySchema,
  /** Staff confirm the candidate agreed to be put forward for this job. */
  consentConfirmed: z.literal(true, { error: "Confirm that the candidate agreed to be put forward for this job." }),
  consentMethod: z.enum(CONSENT_CAPTURE_METHODS),
  consentNote: optionalText(1000),
  assignedToUserId: uuid().optional().nullable().transform((v) => v ?? null),
  internalNote: optionalText(5000),
});
export type StaffAssignInput = z.input<typeof staffAssignSchema>;

export const transitionOptionsSchema = z.object({
  internalNote: optionalText(5000),
  candidateVisibleNote: optionalText(2000),
  rejectionReasonCode: z.enum(REJECTION_REASON_OPTIONS).optional().nullable().transform((v) => v ?? null),
  rejectionReason: optionalText(2000),
});
export type TransitionOptionsInput = z.input<typeof transitionOptionsSchema>;

export const transitionSchema = transitionOptionsSchema.extend({
  applicationId: uuid(),
  toStageKey: z.string().trim().min(1).max(80),
});

export const bulkTransitionSchema = transitionOptionsSchema.extend({
  applicationIds: z.array(uuid()).min(1, "Select at least one application").max(200, "Select at most 200 applications"),
  toStageKey: z.string().trim().min(1).max(80),
});

export const withdrawApplicationSchema = z.object({
  applicationId: uuid(),
  reason: optionalText(1000),
});

export const shareApplicationsSchema = z.object({
  applicationIds: z.array(uuid()).min(1).max(200),
});

export const applicationReviewSchema = z.object({
  applicationId: uuid(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  isShortlisted: z.boolean().optional(),
});

export const assignApplicationOwnerSchema = z.object({
  applicationId: uuid(),
  assignedToUserId: uuid().nullable(),
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export const applicationNoteSchema = z.object({
  applicationId: uuid(),
  body: requiredText(5000, "Note"),
  visibility: z.enum(NOTE_VISIBILITY_OPTIONS).default("staff_only"),
});

export const updateApplicationNoteSchema = z.object({
  noteId: uuid(),
  body: requiredText(5000, "Note").optional(),
  isPinned: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Talent lists
// ---------------------------------------------------------------------------

export const talentListSchema = z.object({
  name: requiredText(120, "List name"),
  description: optionalText(2000),
  kind: z.enum(TALENT_LIST_KIND_OPTIONS).default("shortlist"),
  jobId: uuid().optional().nullable().transform((v) => v ?? null),
  requirementId: uuid().optional().nullable().transform((v) => v ?? null),
  isShared: z.boolean().default(false),
});
export type TalentListInput = z.input<typeof talentListSchema>;

export const updateTalentListSchema = z.object({
  listId: uuid(),
  name: requiredText(120, "List name").optional(),
  description: patchText(2000),
  kind: z.enum(TALENT_LIST_KIND_OPTIONS).optional(),
  jobId: uuid().nullable().optional(),
  requirementId: uuid().nullable().optional(),
  isShared: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type UpdateTalentListInput = z.input<typeof updateTalentListSchema>;

export const talentListItemsSchema = z.object({
  listId: uuid(),
  candidateIds: z.array(uuid()).min(1).max(100),
  note: optionalText(2000),
});

export const talentListItemUpdateSchema = z.object({
  listId: uuid(),
  candidateId: uuid(),
  note: patchText(2000),
  stage: patchText(80),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

export const compareCandidatesSchema = z.object({
  listId: uuid(),
  candidateIds: z.array(uuid()).min(2, "Choose at least two candidates").max(4, "Compare up to four candidates"),
});

// ---------------------------------------------------------------------------
// Unlocks
// ---------------------------------------------------------------------------

export const unlockCandidateSchema = z.object({
  candidateId: uuid(),
  jobId: uuid().optional().nullable().transform((v) => v ?? null),
  reason: optionalText(500),
});

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

const localDateTime = () => z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "Enter a valid date and time");

export const interviewParticipantSchema = z.object({
  userId: uuid().optional().nullable().transform((v) => v ?? null),
  name: requiredText(200, "Name"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).optional().nullable().transform((v) => v ?? null),
  role: z.enum(PARTICIPANT_ROLE_OPTIONS).default("interviewer"),
});

export const scheduleInterviewSchema = z.object({
  applicationId: uuid(),
  roundName: requiredText(120, "Round name"),
  roundNumber: z.number().int().min(1).max(20).optional(),
  mode: z.enum(INTERVIEW_MODE_OPTIONS),
  startsAtLocal: localDateTime(),
  timezone: z.string().trim().min(1).max(64),
  durationMinutes: z.number().int().min(5).max(12 * 60).default(60),
  location: optionalText(500),
  meetingUrl: z.string().trim().pipe(z.url("Enter a valid URL (including https://)")).optional().nullable().transform((v) => v ?? null),
  candidateInstructions: optionalText(2000),
  participants: z.array(interviewParticipantSchema).max(20).default([]),
  /** Staff only: who conducts it (default: the employer when the job has one, Venkat Sai for trade tests). */
  conductedBy: z.enum(["employer", "venkat_sai"]).optional(),
  skillAssessmentId: uuid().optional().nullable().transform((v) => v ?? null),
});
export type ScheduleInterviewInput = z.input<typeof scheduleInterviewSchema>;

export const rescheduleInterviewSchema = z.object({
  interviewId: uuid(),
  startsAtLocal: localDateTime(),
  timezone: z.string().trim().min(1).max(64),
  durationMinutes: z.number().int().min(5).max(12 * 60).default(60),
  location: optionalText(500),
  meetingUrl: z.string().trim().pipe(z.url("Enter a valid URL (including https://)")).optional().nullable().transform((v) => v ?? null),
  candidateInstructions: optionalText(2000),
  reason: optionalText(1000),
});
export type RescheduleInterviewInput = z.input<typeof rescheduleInterviewSchema>;

export const cancelInterviewSchema = z.object({ interviewId: uuid(), reason: requiredText(1000, "Reason") });

export const completeInterviewSchema = z.object({
  interviewId: uuid(),
  status: z.enum(["completed", "no_show"]).default("completed"),
  outcome: z.enum(INTERVIEW_OUTCOME_OPTIONS).default("pending"),
});

export const interviewFeedbackSchema = z.object({
  interviewId: uuid(),
  rating: z.number().int().min(1).max(5).optional().nullable().transform((v) => v ?? null),
  recommendation: z.enum(RECOMMENDATION_OPTIONS),
  scorecard: z
    .array(
      z.object({
        criterion: requiredText(120, "Criterion"),
        score: z.number().min(0).max(100),
        maxScore: z.number().positive().max(100),
        comment: z.string().trim().max(1000).optional(),
      }),
    )
    .max(30)
    .default([]),
  strengths: optionalText(4000),
  concerns: optionalText(4000),
  notes: optionalText(4000),
});

export const interviewResponseSchema = z.object({
  interviewId: uuid(),
  response: z.enum(INTERVIEW_RESPONSE_OPTIONS).exclude(["pending"]),
  note: optionalText(1000),
});

export const interviewParticipantsSchema = z.object({
  interviewId: uuid(),
  participants: z.array(interviewParticipantSchema).max(20),
});

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

const offerFields = {
  jobTitle: requiredText(200, "Job title"),
  salaryMinor: minor().optional().nullable().transform((v) => v ?? null),
  salaryCurrency: currency().optional().nullable().transform((v) => v ?? null),
  salaryPeriod: z.enum(SALARY_PERIODS).optional().nullable().transform((v) => v ?? null),
  benefits: optionalText(4000),
  countryCode: country().optional().nullable().transform((v) => v ?? null),
  workLocation: optionalText(300),
  startDate: optionalDate(),
  contractDurationMonths: z.number().int().min(1).max(120).optional().nullable().transform((v) => v ?? null),
  /** Offer letter (purpose application_attachment, uploaded by the acting user). */
  offerFileId: uuid().optional().nullable().transform((v) => v ?? null),
  expiresAt: z.coerce.date().optional().nullable().transform((v) => v ?? null),
  internalNotes: optionalText(4000),
};

const salaryConsistent = (v: { salaryMinor: number | null; salaryCurrency: string | null; salaryPeriod: string | null }) =>
  v.salaryMinor === null || (v.salaryCurrency !== null && v.salaryPeriod !== null);

export const createOfferSchema = z
  .object({ applicationId: uuid(), ...offerFields })
  .refine(salaryConsistent, { message: "A salary needs a currency and a period", path: ["salaryCurrency"] });
export type CreateOfferInput = z.input<typeof createOfferSchema>;

export const updateOfferSchema = z
  .object({ offerId: uuid(), ...offerFields })
  .refine(salaryConsistent, { message: "A salary needs a currency and a period", path: ["salaryCurrency"] });
export type UpdateOfferInput = z.input<typeof updateOfferSchema>;

export const issueOfferSchema = z.object({ offerId: uuid(), expiresAt: z.coerce.date().optional().nullable().transform((v) => v ?? null) });
export const withdrawOfferSchema = z.object({ offerId: uuid(), reason: requiredText(1000, "Reason") });

export const respondToOfferSchema = z
  .object({
    offerId: uuid(),
    response: z.enum(["accept", "decline"]),
    declineReason: optionalText(1000),
    /** Countersigned offer (purpose application_attachment, uploaded by the candidate). */
    signedOfferFileId: uuid().optional().nullable().transform((v) => v ?? null),
  })
  .refine((v) => v.response === "accept" || v.signedOfferFileId === null, { message: "Only an accepted offer can be countersigned", path: ["signedOfferFileId"] });

// ---------------------------------------------------------------------------
// Placements and mobilisation
// ---------------------------------------------------------------------------

export const confirmJoinedSchema = z.object({ placementId: uuid(), joinedOn: dateString() });

export const updatePlacementSchema = z
  .object({
    placementId: uuid(),
    status: z.enum(["pending_joining", "mobilising", "replacement_required", "cancelled", "completed"]).optional(),
    reason: patchText(1000),
    replacementDeadline: patchDate(),
    feeMinor: minor().nullable().optional(),
    feeCurrency: currency().nullable().optional(),
    workLocation: patchText(300),
    notes: patchText(4000),
  })
  .refine((v) => v.feeMinor === undefined || v.feeMinor === null || Boolean(v.feeCurrency), { message: "A fee needs a currency", path: ["feeCurrency"] });
export type UpdatePlacementInput = z.input<typeof updatePlacementSchema>;

export const linkReplacementSchema = z.object({ placementId: uuid(), replacesPlacementId: uuid() });

export const startMobilisationSchema = z.object({ placementId: uuid(), destinationCountryCode: country() });

/** Partial update: omitted fields keep their value, null clears. */
export const updateMobilisationSchema = z.object({
  mobilisationId: uuid(),
  status: z.enum(MOBILISATION_STATUS_OPTIONS).optional(),
  statusReason: patchText(1000),
  visaType: patchText(120),
  visaStatus: z.enum(VISA_STATUS_OPTIONS).optional(),
  /** Plain visa number: stored encrypted with the last 4 characters for display. */
  visaNumber: patchText(40),
  visaIssuedOn: patchDate(),
  visaExpiresOn: patchDate(),
  medicalStatus: z.enum(MEDICAL_STATUS_OPTIONS).optional(),
  medicalCompletedOn: patchDate(),
  medicalValidUntil: patchDate(),
  emigrationClearanceStatus: z.enum(EMIGRATION_CLEARANCE_OPTIONS).optional(),
  emigrationClearanceReference: patchText(120),
  emigrationClearedOn: patchDate(),
  pdosCompleted: z.boolean().optional(),
  pdosCompletedOn: patchDate(),
  travelDate: patchDate(),
  flightDetails: patchText(1000),
  departedAt: z.coerce.date().nullable().optional(),
  arrivedAt: z.coerce.date().nullable().optional(),
  accommodationDetails: patchText(2000),
  candidateInstructions: patchText(4000),
  coordinatorUserId: uuid().nullable().optional(),
  notes: patchText(4000),
});
export type UpdateMobilisationInput = z.input<typeof updateMobilisationSchema>;

export const submitChecklistItemSchema = z.object({
  itemId: uuid(),
  /** Document (purpose mobilisation_document) uploaded by the acting user / partner organisation. */
  fileId: uuid().optional().nullable().transform((v) => v ?? null),
  note: optionalText(1000),
});

export const reviewChecklistItemSchema = z
  .object({
    itemId: uuid(),
    decision: z.enum(["verified", "rejected", "not_applicable", "pending"]),
    rejectionReason: optionalText(1000),
    notes: optionalText(2000),
  })
  .refine((v) => v.decision !== "rejected" || Boolean(v.rejectionReason), { message: "Tell the candidate what needs to change", path: ["rejectionReason"] });

export const addChecklistItemSchema = z.object({
  mobilisationId: uuid(),
  item: requiredText(200, "Item"),
  description: optionalText(2000),
  category: z.enum(CHECKLIST_CATEGORY_OPTIONS).default("document"),
  responsibleParty: z.enum(RESPONSIBLE_PARTY_OPTIONS).default("venkat_sai"),
  isRequired: z.boolean().default(true),
  isCandidateVisible: z.boolean().default(true),
  dueDate: optionalDate(),
});

// ---------------------------------------------------------------------------
// Partner workflow
// ---------------------------------------------------------------------------

export const commissionTermsSchema = z
  .object({
    model: z.enum(["fixed_per_placement", "percent_of_fee", "none", "custom"]).optional(),
    amountMinor: minor().optional(),
    currency: currency().optional(),
    percentBasisPoints: z.number().int().min(0).max(10_000).optional(),
    payableAfterDays: z.number().int().min(0).max(365).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.amountMinor === undefined || v.currency !== undefined, { message: "A fixed amount needs a currency", path: ["currency"] })
  .optional()
  .transform((v) => v ?? {});

export const createAssignmentSchema = z
  .object({
    partnerOrganizationId: uuid(),
    requirementId: uuid().optional().nullable().transform((v) => v ?? null),
    jobId: uuid().optional().nullable().transform((v) => v ?? null),
    positionsTarget: z.number().int().min(1).max(100_000).optional().nullable().transform((v) => v ?? null),
    submissionLimit: z.number().int().min(1).max(100_000).optional().nullable().transform((v) => v ?? null),
    commissionTerms: commissionTermsSchema,
    dueDate: optionalDate(),
    instructions: optionalText(4000),
    internalNotes: optionalText(4000),
  })
  .refine((v) => v.requirementId !== null || v.jobId !== null, { message: "Choose a requirement or a job", path: ["requirementId"] });
export type CreateAssignmentInput = z.input<typeof createAssignmentSchema>;

/** Partial update: omitted fields keep their value, null clears. */
export const updateAssignmentSchema = z.object({
  assignmentId: uuid(),
  status: z.enum(["active", "paused", "completed", "revoked"]).optional(),
  reason: patchText(1000),
  positionsTarget: z.number().int().min(1).max(100_000).nullable().optional(),
  submissionLimit: z.number().int().min(1).max(100_000).nullable().optional(),
  commissionTerms: z
    .object({
      model: z.enum(["fixed_per_placement", "percent_of_fee", "none", "custom"]).optional(),
      amountMinor: minor().optional(),
      currency: currency().optional(),
      percentBasisPoints: z.number().int().min(0).max(10_000).optional(),
      payableAfterDays: z.number().int().min(0).max(365).optional(),
      notes: z.string().trim().max(2000).optional(),
    })
    .refine((v) => v.amountMinor === undefined || v.currency !== undefined, { message: "A fixed amount needs a currency", path: ["currency"] })
    .optional(),
  dueDate: patchDate(),
  instructions: patchText(4000),
  internalNotes: patchText(4000),
});
export type UpdateAssignmentInput = z.input<typeof updateAssignmentSchema>;

export const newPartnerCandidateSchema = z
  .object({
    kind: z.literal("new"),
    fullName: requiredText(200, "Full name"),
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).optional().nullable().transform((v) => v ?? null),
    /** E.164 (validated / normalised by the service). */
    phone: z.string().trim().max(32).optional().nullable().transform((v) => v ?? null),
    dateOfBirth: optionalDate(),
    passportNumber: optionalText(20),
    passportExpiry: optionalDate(),
    nationalityCode: country().optional().nullable().transform((v) => v ?? null),
    currentCountryCode: country().optional().nullable().transform((v) => v ?? null),
    city: optionalText(120),
    currentJobTitle: optionalText(200),
    headline: optionalText(200),
    totalExperienceMonths: z.number().int().min(0).max(720).optional().nullable().transform((v) => v ?? null),
    /** Resume uploaded by the partner (purpose resume, organisation = the partner). */
    resumeFileId: uuid().optional().nullable().transform((v) => v ?? null),
    preferredLocale: z.enum(["en", "hi", "te"]).optional(),
  })
  .refine((v) => Boolean(v.email || v.phone), { message: "Enter an email address or a phone number so the candidate can be contacted", path: ["email"] });

export const existingPartnerCandidateSchema = z.object({ kind: z.literal("existing"), candidateId: uuid() });

export const partnerSubmissionSchema = z.object({
  assignmentId: uuid(),
  /** Target job when the assignment covers a requirement with several jobs. */
  jobId: uuid().optional().nullable().transform((v) => v ?? null),
  candidate: z.discriminatedUnion("kind", [newPartnerCandidateSchema, existingPartnerCandidateSchema]),
  partnerNotes: optionalText(4000),
  consent: z.object({
    /** The partner attests the candidate agreed to be submitted for this requirement and to have the profile shared with the hiring employer. */
    attested: z.literal(true, { error: "Confirm that the candidate gave consent." }),
    method: z.enum(CONSENT_CAPTURE_METHODS),
    capturedOn: optionalDate(),
    /** Optional evidence (signed form, message screenshot) uploaded by the partner. */
    evidenceFileId: uuid().optional().nullable().transform((v) => v ?? null),
  }),
});
export type PartnerSubmissionInput = z.input<typeof partnerSubmissionSchema>;

export const acceptSubmissionSchema = z.object({
  submissionId: uuid(),
  /** Required when the assignment targets a requirement and the submission has no job yet. */
  jobId: uuid().optional().nullable().transform((v) => v ?? null),
  reviewNotes: optionalText(4000),
  partnerFeedback: optionalText(2000),
});

export const rejectSubmissionSchema = z.object({
  submissionId: uuid(),
  rejectionReasonCode: z.enum(REJECTION_REASON_OPTIONS),
  partnerFeedback: optionalText(2000),
  reviewNotes: optionalText(4000),
});

export const submissionNoteSchema = z.object({ submissionId: uuid(), reviewNotes: optionalText(4000) });

export const resolveDuplicateFlagSchema = z.object({
  flagId: uuid(),
  status: z.enum(["confirmed_duplicate", "not_duplicate", "merged"]),
  resolutionNotes: optionalText(2000),
});

export const updateAttributionSchema = z.object({
  attributionId: uuid(),
  status: z.enum(ATTRIBUTION_STATUS_OPTIONS),
  resolutionNotes: requiredText(2000, "Resolution notes"),
});
