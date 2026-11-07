/**
 * Turns the submit-candidate form fields into the `submitCandidateAction` input (client-safe, pure).
 * Blank strings become null/undefined so the module's zod schema applies its own defaults, the
 * experience in years becomes whole months, and the consent block is always present (the schema
 * reports a missing attestation as `consent.attested`).
 */
export type SubmissionDraft = Partial<
  Record<
    | "candidateId"
    | "fullName"
    | "email"
    | "phone"
    | "dateOfBirth"
    | "nationalityCode"
    | "currentCountryCode"
    | "city"
    | "currentJobTitle"
    | "experienceYears"
    | "passportNumber"
    | "passportExpiry"
    | "preferredLocale"
    | "resumeFileId"
    | "jobId"
    | "partnerNotes"
    | "consentMethod"
    | "consentCapturedOn"
    | "evidenceFileId"
    | "consentAttested",
    string
  >
>;

const blank = (v: string | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

export function experienceMonths(years: string | undefined): number | null {
  const t = blank(years);
  if (t === null) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(720, Math.round(n * 12));
}

export function buildSubmissionPayload(assignmentId: string, mode: "existing" | "new", d: SubmissionDraft) {
  const candidate =
    mode === "existing"
      ? { kind: "existing" as const, candidateId: blank(d.candidateId) ?? "" }
      : {
          kind: "new" as const,
          fullName: blank(d.fullName) ?? "",
          email: blank(d.email),
          phone: blank(d.phone),
          dateOfBirth: blank(d.dateOfBirth) ?? undefined,
          passportNumber: blank(d.passportNumber) ?? undefined,
          passportExpiry: blank(d.passportExpiry) ?? undefined,
          nationalityCode: blank(d.nationalityCode),
          currentCountryCode: blank(d.currentCountryCode),
          city: blank(d.city) ?? undefined,
          currentJobTitle: blank(d.currentJobTitle) ?? undefined,
          totalExperienceMonths: experienceMonths(d.experienceYears),
          resumeFileId: blank(d.resumeFileId),
          preferredLocale: (["en", "hi", "te"] as const).find((l) => l === d.preferredLocale),
        };
  return {
    assignmentId,
    jobId: blank(d.jobId),
    candidate,
    partnerNotes: blank(d.partnerNotes) ?? undefined,
    consent: {
      attested: d.consentAttested === "true",
      method: blank(d.consentMethod) ?? "",
      capturedOn: blank(d.consentCapturedOn) ?? undefined,
      evidenceFileId: blank(d.evidenceFileId),
    },
  };
}
