import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { candidateEducation, candidateExperience, candidateProfiles } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { notify } from "@/modules/notifications";

import { auditContext, lockCandidateTarget, type CandidateTarget } from "./actor";
import { CANDIDATE_LIMITS, PROFILE_PATH } from "./constants";
import { refreshCandidateDerived } from "./derived";
import { assertCountries, assertEducationLevel, assertIndustry, assertJobCategories, assertQualificationType } from "./refs";
import type { EducationInput, ExperienceInput, ItemVerificationInput } from "./schemas";
import type { CandidateActor, CandidateEducationRow, CandidateExperienceRow } from "./types";
import { acceptCandidateUpload } from "./uploads";

/**
 * Education and work history. Editing the facts a reviewer verified (institution, qualification,
 * employer, title, dates, evidence) sends a verified entry back to "unverified"; descriptions can be
 * edited freely. Reference contacts are private (self + staff with candidates.view_contact).
 */

function changedKeys<T extends Record<string, unknown>>(before: T, after: Partial<T>, keys: readonly (keyof T)[]): (keyof T)[] {
  return keys.filter((key) => key in after && (before[key] ?? null) !== (after[key] ?? null));
}

async function nextSortOrder(table: typeof candidateEducation | typeof candidateExperience, candidateId: string, tx: DbOrTx): Promise<number> {
  const [row] = await tx
    .select({ value: sql<number>`coalesce(max(${table.sortOrder}), -1)::int` })
    .from(table)
    .where(eq(table.candidateId, candidateId));
  return Number(row?.value ?? -1) + 1;
}

async function countRows(table: typeof candidateEducation | typeof candidateExperience, candidateId: string, tx: DbOrTx): Promise<number> {
  const [row] = await tx.select({ value: sql<number>`count(*)::int` }).from(table).where(eq(table.candidateId, candidateId));
  return Number(row?.value ?? 0);
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

const EDUCATION_VERIFIED_FACTS = [
  "educationLevelId",
  "qualificationTypeId",
  "institutionName",
  "boardOrUniversity",
  "qualification",
  "specialisation",
  "countryCode",
  "startDate",
  "endDate",
  "isCurrent",
  "gradeOrScore",
  "documentFileId",
] as const;

/** Add (no id) or update (id) an education entry. */
export async function saveEducation(actor: CandidateActor, input: EducationInput): Promise<CandidateEducationRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    await assertEducationLevel(input.educationLevelId, "educationLevelId", tx);
    await assertQualificationType(input.qualificationTypeId, "qualificationTypeId", tx);
    await assertCountries([input.countryCode], "countryCode", tx);

    const existing = input.id ? await loadOwned(candidateEducation, input.id, target, tx) : null;
    if (input.documentFileId && input.documentFileId !== existing?.documentFileId) {
      await acceptCandidateUpload(target, input.documentFileId, ["candidate_document", "candidate_credential"], tx);
    }
    const values = {
      educationLevelId: input.educationLevelId ?? null,
      qualificationTypeId: input.qualificationTypeId ?? null,
      institutionName: input.institutionName,
      boardOrUniversity: input.boardOrUniversity ?? null,
      qualification: input.qualification ?? null,
      specialisation: input.specialisation ?? null,
      countryCode: input.countryCode ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      isCurrent: input.isCurrent,
      gradeOrScore: input.gradeOrScore ?? null,
      documentFileId: input.documentFileId ?? null,
    };

    let row: CandidateEducationRow;
    if (existing) {
      const resetVerification = existing.verificationStatus !== "unverified" && changedKeys(existing, values, EDUCATION_VERIFIED_FACTS).length > 0;
      [row] = (await tx
        .update(candidateEducation)
        .set({ ...values, ...(resetVerification ? { verificationStatus: "unverified" as const, verifiedByUserId: null, verifiedAt: null, verificationNote: null } : {}) })
        .where(eq(candidateEducation.id, existing.id))
        .returning()) as [CandidateEducationRow];
    } else {
      if ((await countRows(candidateEducation, target.candidateId, tx)) >= CANDIDATE_LIMITS.education) {
        throw new ActionError(`You can add up to ${CANDIDATE_LIMITS.education} education entries.`);
      }
      [row] = (await tx
        .insert(candidateEducation)
        .values({ ...values, candidateId: target.candidateId, sortOrder: await nextSortOrder(candidateEducation, target.candidateId, tx) })
        .returning()) as [CandidateEducationRow];
    }
    if (target.onBehalf) {
      await audit({ action: existing ? "candidate.education_updated" : "candidate.education_added", entityType: "candidate_education", entityId: row.id, metadata: { candidateId: target.candidateId, onBehalf: true }, ...auditContext(target), tx });
    }
    await refreshCandidateDerived(target.candidateId, tx);
    return row;
  });
}

export async function deleteEducation(actor: CandidateActor, educationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const existing = await loadOwned(candidateEducation, educationId, target, tx);
    await tx.delete(candidateEducation).where(eq(candidateEducation.id, existing.id));
    if (target.onBehalf || existing.verificationStatus === "verified") {
      await audit({ action: "candidate.education_deleted", entityType: "candidate_education", entityId: existing.id, metadata: { candidateId: target.candidateId, wasVerified: existing.verificationStatus === "verified", onBehalf: target.onBehalf }, ...auditContext(target), tx });
    }
    await refreshCandidateDerived(target.candidateId, tx);
  });
}

export async function reorderEducation(actor: CandidateActor, orderedIds: string[]): Promise<void> {
  await reorder(actor, candidateEducation, orderedIds);
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

const EXPERIENCE_VERIFIED_FACTS = ["employerName", "jobTitle", "employmentType", "countryCode", "city", "startDate", "endDate", "isCurrent", "evidenceFileId"] as const;

/** Add (no id) or update (id) a work-history entry. */
export async function saveExperience(actor: CandidateActor, input: ExperienceInput): Promise<CandidateExperienceRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    await assertIndustry(input.industryId, "industryId", tx);
    await assertJobCategories([input.jobCategoryId], "jobCategoryId", tx);
    await assertCountries([input.countryCode], "countryCode", tx);

    const existing = input.id ? await loadOwned(candidateExperience, input.id, target, tx) : null;
    if (input.evidenceFileId && input.evidenceFileId !== existing?.evidenceFileId) {
      await acceptCandidateUpload(target, input.evidenceFileId, ["candidate_document"], tx);
    }
    const values = {
      employerName: input.employerName,
      jobTitle: input.jobTitle,
      industryId: input.industryId ?? null,
      jobCategoryId: input.jobCategoryId ?? null,
      countryCode: input.countryCode ?? null,
      city: input.city ?? null,
      employmentType: input.employmentType ?? null,
      startDate: input.startDate ?? null,
      endDate: input.isCurrent ? null : (input.endDate ?? null),
      isCurrent: input.isCurrent,
      responsibilities: input.responsibilities ?? null,
      projects: input.projects ?? null,
      achievements: input.achievements ?? null,
      evidenceFileId: input.evidenceFileId ?? null,
      referenceName: input.referenceName ?? null,
      referenceContact: input.referenceContact ?? null,
    };

    let row: CandidateExperienceRow;
    if (existing) {
      const resetVerification = existing.verificationStatus !== "unverified" && changedKeys(existing, values, EXPERIENCE_VERIFIED_FACTS).length > 0;
      [row] = (await tx
        .update(candidateExperience)
        .set({ ...values, ...(resetVerification ? { verificationStatus: "unverified" as const, verifiedByUserId: null, verifiedAt: null, verificationNote: null } : {}) })
        .where(eq(candidateExperience.id, existing.id))
        .returning()) as [CandidateExperienceRow];
    } else {
      if ((await countRows(candidateExperience, target.candidateId, tx)) >= CANDIDATE_LIMITS.experience) {
        throw new ActionError(`You can add up to ${CANDIDATE_LIMITS.experience} jobs to your work history.`);
      }
      [row] = (await tx
        .insert(candidateExperience)
        .values({ ...values, candidateId: target.candidateId, sortOrder: await nextSortOrder(candidateExperience, target.candidateId, tx) })
        .returning()) as [CandidateExperienceRow];
    }
    if (target.onBehalf) {
      await audit({ action: existing ? "candidate.experience_updated" : "candidate.experience_added", entityType: "candidate_experience", entityId: row.id, metadata: { candidateId: target.candidateId, onBehalf: true }, ...auditContext(target), tx });
    }
    await refreshCandidateDerived(target.candidateId, tx);
    return row;
  });
}

export async function deleteExperience(actor: CandidateActor, experienceId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const existing = await loadOwned(candidateExperience, experienceId, target, tx);
    await tx.delete(candidateExperience).where(eq(candidateExperience.id, existing.id));
    if (target.onBehalf || existing.verificationStatus === "verified") {
      await audit({ action: "candidate.experience_deleted", entityType: "candidate_experience", entityId: existing.id, metadata: { candidateId: target.candidateId, wasVerified: existing.verificationStatus === "verified", onBehalf: target.onBehalf }, ...auditContext(target), tx });
    }
    await refreshCandidateDerived(target.candidateId, tx);
  });
}

export async function reorderExperience(actor: CandidateActor, orderedIds: string[]): Promise<void> {
  await reorder(actor, candidateExperience, orderedIds);
}

// ---------------------------------------------------------------------------
// Staff verification of education / experience entries
// ---------------------------------------------------------------------------

/** Staff (candidates.verify) record the result of checking an education entry. The candidate is notified. */
export async function setEducationVerification(ctx: StaffContext, input: ItemVerificationInput): Promise<CandidateEducationRow> {
  return setHistoryVerification(ctx, candidateEducation, "education", input) as Promise<CandidateEducationRow>;
}

/** Staff (candidates.verify) record the result of checking a work-history entry. The candidate is notified. */
export async function setExperienceVerification(ctx: StaffContext, input: ItemVerificationInput): Promise<CandidateExperienceRow> {
  return setHistoryVerification(ctx, candidateExperience, "experience", input) as Promise<CandidateExperienceRow>;
}

async function setHistoryVerification(
  ctx: StaffContext,
  table: typeof candidateEducation | typeof candidateExperience,
  kind: "education" | "experience",
  input: ItemVerificationInput,
): Promise<CandidateEducationRow | CandidateExperienceRow> {
  if (!staffCan(ctx, "candidates.verify")) throw new ActionError("You do not have permission to verify candidate records.", { code: "forbidden" });
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(table).where(eq(table.id, input.id)).limit(1);
    if (!existing) throw new ActionError("Entry not found.", { code: "not_found" });
    const [owner] = await tx.select({ userId: candidateProfiles.userId }).from(candidateProfiles).where(eq(candidateProfiles.id, existing.candidateId)).limit(1);
    const verified = input.status === "verified";
    const [row] = await tx
      .update(table)
      .set({
        verificationStatus: input.status,
        verifiedByUserId: input.status === "unverified" ? null : ctx.user.id,
        verifiedAt: verified ? new Date() : null,
        verificationNote: input.note ?? null,
      })
      .where(eq(table.id, existing.id))
      .returning();
    await audit({
      action: `candidate.${kind}_${input.status}`,
      entityType: `candidate_${kind}`,
      entityId: existing.id,
      metadata: { candidateId: existing.candidateId, previousStatus: existing.verificationStatus },
      actorUserId: ctx.user.id,
      actorType: "staff",
      tx,
    });
    if (owner && input.status !== "unverified") {
      const label = "institutionName" in existing ? existing.institutionName : `${existing.jobTitle} — ${existing.employerName}`;
      await notify(
        {
          event: "candidate.verification_updated",
          recipients: [{ userId: owner.userId }],
          data: { itemType: kind, itemLabel: label, decision: input.status, reason: input.status === "rejected" ? (input.note ?? null) : null },
          link: `${PROFILE_PATH}#${kind}`,
        },
        { tx },
      );
    }
    return row!;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadOwned<T extends typeof candidateEducation | typeof candidateExperience>(
  table: T,
  id: string,
  target: CandidateTarget,
  tx: DbOrTx,
): Promise<T["$inferSelect"]> {
  const [row] = await tx
    .select()
    .from(table as typeof candidateEducation)
    .where(and(eq(table.id, id), eq(table.candidateId, target.candidateId)))
    .limit(1);
  if (!row) throw new ActionError("This entry could not be found on your profile.", { code: "not_found" });
  return row as T["$inferSelect"];
}

async function reorder(actor: CandidateActor, table: typeof candidateEducation | typeof candidateExperience, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const rows = await tx
      .select({ id: table.id })
      .from(table as typeof candidateEducation)
      .where(eq(table.candidateId, target.candidateId))
      .orderBy(asc(table.sortOrder));
    const owned = new Set(rows.map((r) => r.id));
    if (orderedIds.length !== owned.size || orderedIds.some((id) => !owned.has(id))) {
      throw new ActionError("The list changed while you were editing. Reload the page and try again.");
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx.update(table).set({ sortOrder: index }).where(and(eq(table.id, id), inArray(table.id, orderedIds)));
    }
  });
}
