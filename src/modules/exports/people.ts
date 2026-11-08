import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { applicationNotes, candidateProfiles, internalNotes, jobCategories, users } from "@/db/schema";
import { tryDecryptField } from "@/lib/crypto";
import { maskPhone } from "@/lib/format";
import { maskPassportNumber } from "@/lib/xlsx-export";
import { staffCan, type StaffContext } from "@/modules/identity/authz";

/**
 * Person columns shared by every staff Excel export of candidates (candidates, pipeline, training, partner
 * submissions): name, trade, passport, phone, the candidate's own notes and staff remarks. Masking follows the
 * on-screen rules: full phone numbers need candidates.view_contact, full passport numbers candidates.view_documents.
 */

export type PersonColumns = {
  name: string;
  trade: string;
  passport: string;
  phone: string;
  candidateNotes: string;
  staffRemarks: string;
};

export type ExportVisibility = { fullPhone: boolean; fullPassport: boolean };

export function exportVisibility(ctx: StaffContext): ExportVisibility {
  return { fullPhone: staffCan(ctx, "candidates.view_contact"), fullPassport: staffCan(ctx, "candidates.view_documents") };
}

export function formatPassport(visibility: ExportVisibility, encrypted: string | null, last4: string | null): string {
  if (visibility.fullPassport && encrypted) return tryDecryptField(encrypted) ?? maskPassportNumber(last4);
  return maskPassportNumber(last4);
}

export function formatPhone(visibility: ExportVisibility, phone: string | null): string {
  if (!phone) return "";
  return visibility.fullPhone ? phone : maskPhone(phone);
}

const MAX_NOTE = 1000;
function clip(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  return t.length > MAX_NOTE ? `${t.slice(0, MAX_NOTE - 1)}…` : t;
}

const CHUNK = 1000;
function chunks<T>(values: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += CHUNK) out.push(values.slice(i, i + CHUNK));
  return out;
}

/** Latest staff internal notes per entity (up to 3, newest first, joined). */
async function latestNotes(entityType: string, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string[]>();
  for (const part of chunks(ids)) {
    if (!part.length) continue;
    const rows = await db
      .select({ entityId: internalNotes.entityId, body: internalNotes.body })
      .from(internalNotes)
      .where(and(eq(internalNotes.entityType, entityType), inArray(internalNotes.entityId, part), eq(internalNotes.visibility, "staff"), isNull(internalNotes.deletedAt)))
      .orderBy(desc(internalNotes.createdAt));
    for (const r of rows) {
      const list = out.get(r.entityId) ?? [];
      if (list.length < 3) list.push(r.body.trim());
      out.set(r.entityId, list);
    }
  }
  return new Map([...out].map(([k, v]) => [k, clip(v.join(" | "))]));
}

/** Latest application notes (staff see every visibility) per application (up to 3). */
export async function applicationRemarks(applicationIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string[]>();
  for (const part of chunks(applicationIds)) {
    if (!part.length) continue;
    const rows = await db
      .select({ applicationId: applicationNotes.applicationId, body: applicationNotes.body })
      .from(applicationNotes)
      .where(inArray(applicationNotes.applicationId, part))
      .orderBy(desc(applicationNotes.isPinned), desc(applicationNotes.createdAt));
    for (const r of rows) {
      const list = out.get(r.applicationId) ?? [];
      if (list.length < 3) list.push(r.body.trim());
      out.set(r.applicationId, list);
    }
  }
  return new Map([...out].map(([k, v]) => [k, clip(v.join(" | "))]));
}

/**
 * Person columns for candidate profiles. Trade = preferred job categories, else current job title / headline.
 * Candidate notes = the profile's "about"; staff remarks = latest staff internal notes on the candidate.
 */
export async function candidatePeople(ctx: StaffContext, candidateIds: readonly string[]): Promise<Map<string, PersonColumns & { userId: string }>> {
  const visibility = exportVisibility(ctx);
  const ids = [...new Set(candidateIds)];
  const out = new Map<string, PersonColumns & { userId: string }>();
  if (!ids.length) return out;
  const categoryNames = sql<string[]>`coalesce((select array_agg(${jobCategories.name} order by ${jobCategories.name}) from ${jobCategories} where ${jobCategories.id} = any(${candidateProfiles.preferredCategoryIds})), '{}'::text[])`;
  const remarks = await latestNotes("candidate", ids);
  for (const part of chunks(ids)) {
    const rows = await db
      .select({
        id: candidateProfiles.id,
        userId: candidateProfiles.userId,
        name: users.displayName,
        legalName: candidateProfiles.legalName,
        phone: users.phone,
        passportEncrypted: candidateProfiles.passportNumberEncrypted,
        passportLast4: candidateProfiles.passportNumberLast4,
        headline: candidateProfiles.headline,
        currentJobTitle: candidateProfiles.currentJobTitle,
        about: candidateProfiles.about,
        categories: categoryNames,
      })
      .from(candidateProfiles)
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .where(inArray(candidateProfiles.id, part));
    for (const r of rows) {
      out.set(r.id, {
        userId: r.userId,
        name: r.legalName?.trim() || r.name,
        trade: (r.categories ?? []).join(", ") || r.currentJobTitle || r.headline || "",
        passport: formatPassport(visibility, r.passportEncrypted, r.passportLast4),
        phone: formatPhone(visibility, r.phone),
        candidateNotes: clip(r.about),
        staffRemarks: remarks.get(r.id) ?? "",
      });
    }
  }
  return out;
}

export const EMPTY_PERSON: PersonColumns = { name: "", trade: "", passport: "", phone: "", candidateNotes: "", staffRemarks: "" };
