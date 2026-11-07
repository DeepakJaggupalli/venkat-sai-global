import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { type DbOrTx } from "@/db";
import {
  consentRecords,
  countries,
  currencies,
  educationLevels,
  industries,
  jobCategories,
  languages,
  organizations,
  qualificationTypes,
  skills,
} from "@/db/schema";
import { ActionError } from "@/lib/actions";

/**
 * Reference checks for ids and codes received from forms. Foreign keys would reject bad values
 * too, but with a database error; these turn them into field-level messages before writing.
 */

function fieldError(field: string, message: string): never {
  throw new ActionError(message, { fieldErrors: { [field]: [message] } });
}

export async function assertCountries(codes: (string | null | undefined)[], field: string, tx: DbOrTx): Promise<void> {
  const wanted = [...new Set(codes.filter((c): c is string => Boolean(c)))];
  if (!wanted.length) return;
  const rows = await tx.select({ code: countries.code }).from(countries).where(inArray(countries.code, wanted));
  if (rows.length !== wanted.length) fieldError(field, "Choose a country from the list");
}

export async function assertCurrency(code: string | null | undefined, field: string, tx: DbOrTx): Promise<void> {
  if (!code) return;
  const [row] = await tx.select({ code: currencies.code }).from(currencies).where(and(eq(currencies.code, code), eq(currencies.isActive, true))).limit(1);
  if (!row) fieldError(field, "Choose a currency from the list");
}

export async function assertIndustry(id: string | null | undefined, field: string, tx: DbOrTx): Promise<void> {
  if (!id) return;
  const [row] = await tx.select({ id: industries.id }).from(industries).where(eq(industries.id, id)).limit(1);
  if (!row) fieldError(field, "Choose an industry from the list");
}

export async function assertJobCategories(ids: (string | null | undefined)[], field: string, tx: DbOrTx): Promise<void> {
  const wanted = [...new Set(ids.filter((c): c is string => Boolean(c)))];
  if (!wanted.length) return;
  const rows = await tx.select({ id: jobCategories.id }).from(jobCategories).where(inArray(jobCategories.id, wanted));
  if (rows.length !== wanted.length) fieldError(field, "Choose job categories from the list");
}

export async function assertEducationLevel(id: string | null | undefined, field: string, tx: DbOrTx): Promise<void> {
  if (!id) return;
  const [row] = await tx.select({ id: educationLevels.id }).from(educationLevels).where(eq(educationLevels.id, id)).limit(1);
  if (!row) fieldError(field, "Choose an education level from the list");
}

export async function assertQualificationType(id: string | null | undefined, field: string, tx: DbOrTx): Promise<void> {
  if (!id) return;
  const [row] = await tx.select({ id: qualificationTypes.id }).from(qualificationTypes).where(eq(qualificationTypes.id, id)).limit(1);
  if (!row) fieldError(field, "Choose a qualification type from the list");
}

/** Skills must exist, be active and approved (curated taxonomy). */
export async function assertSkills(ids: string[], field: string, tx: DbOrTx): Promise<void> {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return;
  const rows = await tx
    .select({ id: skills.id })
    .from(skills)
    .where(and(inArray(skills.id, wanted), eq(skills.isActive, true), eq(skills.status, "approved")));
  if (rows.length !== wanted.length) fieldError(field, "Choose skills from the list");
}

export async function assertLanguages(codes: string[], field: string, tx: DbOrTx): Promise<void> {
  const wanted = [...new Set(codes)];
  if (!wanted.length) return;
  const rows = await tx.select({ code: languages.code }).from(languages).where(inArray(languages.code, wanted));
  if (rows.length !== wanted.length) fieldError(field, "Choose languages from the list");
}

/** Organisations a candidate may block must exist (any type). */
export async function assertOrganizations(ids: string[], field: string, tx: DbOrTx): Promise<void> {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return;
  const rows = await tx.select({ id: organizations.id }).from(organizations).where(inArray(organizations.id, wanted));
  if (rows.length !== wanted.length) fieldError(field, "One of the organisations could not be found");
}

/**
 * Any guardian-consent record marks the account as belonging to a minor (DPDP Rules 2025, rule 10),
 * whatever its current state — a withdrawn guardian consent does not make the user an adult.
 */
export async function hasGuardianConsentRecord(userId: string, tx: DbOrTx): Promise<boolean> {
  const [row] = await tx
    .select({ one: sql<number>`1` })
    .from(consentRecords)
    .where(and(eq(consentRecords.userId, userId), eq(consentRecords.purpose, "guardian_consent")))
    .limit(1);
  return Boolean(row);
}
