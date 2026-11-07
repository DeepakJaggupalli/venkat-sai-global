import "server-only";

import { and, asc, count, eq, ilike, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { candidateProfiles, institutionProfiles, organizations, users } from "@/db/schema";

/**
 * Read helpers for Command Centre training pages that the training module does not expose.
 * Callers have already authorised the staff member (training.view / orgs.view). Read-only.
 */

/** Provider display name for a course / batch (null organisation = Venkat Sai). */
export async function providerName(organizationId: string | null): Promise<string> {
  if (!organizationId) return "Venkat Sai";
  const [row] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return row?.name ?? "Institution";
}

export type InstitutionIssuerRow = {
  organizationId: string;
  isAuthorisedCertificateIssuer: boolean;
  authorisedIssuerScope: string | null;
  authorisedAt: Date | null;
  authorisedUntil: string | null;
};

/** Certificate-issuer authorisation of the given institutions. */
export async function issuerProfiles(organizationIds: readonly string[]): Promise<Map<string, InstitutionIssuerRow>> {
  if (!organizationIds.length) return new Map();
  const rows = await db
    .select({
      organizationId: institutionProfiles.organizationId,
      isAuthorisedCertificateIssuer: institutionProfiles.isAuthorisedCertificateIssuer,
      authorisedIssuerScope: institutionProfiles.authorisedIssuerScope,
      authorisedAt: institutionProfiles.authorisedAt,
      authorisedUntil: institutionProfiles.authorisedUntil,
    })
    .from(institutionProfiles)
    .where(inArray(institutionProfiles.organizationId, [...organizationIds]));
  return new Map(rows.map((r) => [r.organizationId, { ...r, authorisedUntil: r.authorisedUntil ? String(r.authorisedUntil) : null }]));
}

export type InstitutionListRow = InstitutionIssuerRow & { name: string; status: string; city: string | null; countryCode: string | null };

/**
 * Institutions with their certificate-issuer authorisation, for training oversight (training.view —
 * staff without orgs.view still need to see which institutions may issue accredited certificates).
 */
export async function listInstitutionsForTraining(opts: { q?: string; authorisedOnly?: boolean }, page: { pageSize: number; offset: number }): Promise<{ rows: InstitutionListRow[]; total: number }> {
  const where = [eq(organizations.type, "institution"), isNull(organizations.deletedAt)];
  if (opts.q?.trim()) where.push(ilike(organizations.name, `%${opts.q.trim().replace(/[%_\\]/g, "")}%`));
  if (opts.authorisedOnly) where.push(eq(institutionProfiles.isAuthorisedCertificateIssuer, true));
  const condition = and(...where);
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        organizationId: organizations.id,
        name: organizations.name,
        status: organizations.status,
        city: organizations.city,
        countryCode: organizations.countryCode,
        isAuthorisedCertificateIssuer: institutionProfiles.isAuthorisedCertificateIssuer,
        authorisedIssuerScope: institutionProfiles.authorisedIssuerScope,
        authorisedAt: institutionProfiles.authorisedAt,
        authorisedUntil: institutionProfiles.authorisedUntil,
      })
      .from(organizations)
      .leftJoin(institutionProfiles, eq(institutionProfiles.organizationId, organizations.id))
      .where(condition)
      .orderBy(asc(organizations.name))
      .limit(page.pageSize)
      .offset(page.offset),
    db.select({ value: count() }).from(organizations).leftJoin(institutionProfiles, eq(institutionProfiles.organizationId, organizations.id)).where(condition),
  ]);
  return {
    rows: rows.map((r) => ({
      ...r,
      isAuthorisedCertificateIssuer: r.isAuthorisedCertificateIssuer ?? false,
      authorisedUntil: r.authorisedUntil ? String(r.authorisedUntil) : null,
    })),
    total: totalRows[0]?.value ?? 0,
  };
}

/** Display names of candidate profiles (staff pages only; no contact details). */
export async function candidateDisplayNames(candidateIds: readonly string[]): Promise<Map<string, string>> {
  if (!candidateIds.length) return new Map();
  const rows = await db
    .select({ id: candidateProfiles.id, name: users.displayName })
    .from(candidateProfiles)
    .innerJoin(users, eq(users.id, candidateProfiles.userId))
    .where(and(inArray(candidateProfiles.id, [...candidateIds]), isNull(candidateProfiles.deletedAt)));
  return new Map(rows.map((r) => [r.id, r.name]));
}
