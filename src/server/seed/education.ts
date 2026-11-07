import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { educationLevels, qualificationTypes } from "@/db/schema";
import type { QualificationKind } from "@/db/schema/_constants";

import { assertUnique, countInserted, type SeedResult } from "./util";

/** Education levels, lowest to highest (rank drives "minimum qualification" filters). */
export const EDUCATION_LEVELS: readonly { key: string; name: string; rank: number }[] = [
  { key: "no_formal_education", name: "No formal education", rank: 0 },
  { key: "primary", name: "Primary", rank: 10 },
  { key: "secondary", name: "Secondary (10th / SSC)", rank: 20 },
  { key: "higher_secondary", name: "Higher secondary (12th / HSC / Intermediate)", rank: 30 },
  { key: "iti_certificate", name: "ITI certificate", rank: 40 },
  { key: "diploma", name: "Diploma", rank: 50 },
  { key: "bachelors_degree", name: "Bachelor's degree", rank: 60 },
  { key: "masters_degree", name: "Master's degree", rank: 70 },
  { key: "doctorate", name: "Doctorate", rank: 80 },
];

/** Qualification types for candidate education and credentials. */
export const QUALIFICATION_TYPES: readonly { key: string; name: string; kind: QualificationKind }[] = [
  { key: "iti_ncvt", name: "ITI (NCVT)", kind: "trade_certificate" },
  { key: "iti_scvt", name: "ITI (SCVT)", kind: "trade_certificate" },
  { key: "diploma", name: "Diploma", kind: "diploma" },
  { key: "degree", name: "Degree", kind: "degree" },
  { key: "postgraduate_degree", name: "Postgraduate degree", kind: "degree" },
  { key: "trade_certificate", name: "Trade certificate", kind: "trade_certificate" },
  { key: "apprenticeship_certificate", name: "Apprenticeship certificate", kind: "certificate" },
  { key: "professional_licence", name: "Professional licence", kind: "licence" },
  { key: "safety_certification", name: "Safety certification", kind: "certificate" },
  { key: "ndt_certification", name: "NDT certification", kind: "certificate" },
  { key: "language_certificate", name: "Language certificate", kind: "certificate" },
  { key: "other", name: "Other", kind: "other" },
];

export async function seedEducationLevels(): Promise<SeedResult> {
  assertUnique(EDUCATION_LEVELS, (l) => l.key, "education level key");
  const rows = await db
    .insert(educationLevels)
    .values(EDUCATION_LEVELS.map((l) => ({ ...l, isActive: true })))
    .onConflictDoNothing({ target: educationLevels.key })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return { name: "education levels", ...countInserted(rows), total: EDUCATION_LEVELS.length };
}

export async function seedQualificationTypes(): Promise<SeedResult> {
  assertUnique(QUALIFICATION_TYPES, (q) => q.key, "qualification type key");
  const rows = await db
    .insert(qualificationTypes)
    .values(QUALIFICATION_TYPES.map((q) => ({ ...q, isActive: true })))
    .onConflictDoNothing({ target: qualificationTypes.key })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return { name: "qualification types", ...countInserted(rows), total: QUALIFICATION_TYPES.length };
}
