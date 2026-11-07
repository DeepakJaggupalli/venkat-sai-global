import "server-only";

import { and, count, eq, gt, isNull, or, type SQL } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { courses, files, institutionProfiles, organizations } from "@/db/schema";
import { sanitizeRichText } from "@/lib/sanitize";
import { audit } from "@/modules/audit";
import { fileUrl, requireUploadedFile, setFileVisibility, thumbnailUrl } from "@/modules/files";
import type { StaffContext } from "@/modules/identity/authz";

import { assertStaff, authorizeOrg, ORG_PERMISSION, type OrgActor } from "./access";
import { invalidStateError } from "./errors";
import type { InstitutionProfileRow } from "./readiness";
import { hasValidVerification, toIsoDate } from "./rules";
import type { InstitutionProfileInput, IssuerAuthorisationInput } from "./schemas";

const INSTITUTION_ONLY = ["institution"] as const;

export type PublicInstitution = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  countryCode: string | null;
  city: string | null;
  logo: { url: string; thumbnailUrl: string | null } | null;
  cover: { url: string; thumbnailUrl: string | null } | null;
  verifiedAt: Date | null;
  institutionKind: InstitutionProfileRow["institutionKind"];
  /** As declared by the institution (accreditation is verified through its documents, not shown as a Venkat Sai claim). */
  declaredAccreditationBodies: string[];
  declaredAffiliation: string | null;
  establishedYear: number | null;
  aboutHtml: string | null;
  /** Authorised by Venkat Sai to issue accredited certificates on the platform (and the verified scope). */
  authorisedCertificateIssuer: { scope: string | null; until: string | null } | null;
  publishedCourseCount: number;
};

/** Whether an institution may issue accredited_external certificates today (authorised by staff and not lapsed). */
export function isAuthorisedIssuerNow(profile: Pick<InstitutionProfileRow, "isAuthorisedCertificateIssuer" | "authorisedUntil"> | null, now: Date = new Date()): boolean {
  if (!profile?.isAuthorisedCertificateIssuer) return false;
  return !profile.authorisedUntil || profile.authorisedUntil >= toIsoDate(now);
}

export async function getInstitutionProfile(actor: OrgActor, organizationId: string, tx: DbOrTx = db): Promise<InstitutionProfileRow | null> {
  await authorizeOrg(actor, organizationId, { member: "any", staff: ["orgs.view", "training.view"], staffMode: "any", types: INSTITUTION_ONLY }, { tx });
  const [row] = await tx.select().from(institutionProfiles).where(eq(institutionProfiles.organizationId, organizationId)).limit(1);
  return row ?? null;
}

/**
 * Update the institution profile (institution.profile.manage / staff orgs.manage). The certificate-issuer
 * authorisation is not editable here (setCertificateIssuerAuthorisation, staff only).
 */
export async function updateInstitutionProfile(actor: OrgActor, organizationId: string, input: InstitutionProfileInput): Promise<void> {
  await db.transaction(async (tx) => {
    const access = await authorizeOrg(actor, organizationId, { member: ORG_PERMISSION.profile, staff: "orgs.manage", types: INSTITUTION_ONLY }, { tx, lock: true });
    let coverFileId: string | null = null;
    if (input.coverFileId) {
      const file = await requireUploadedFile(input.coverFileId, { purposes: ["org_logo"], organizationId, ownerUserId: access.actorUserId }, tx);
      if (file.visibility !== "public") await setFileVisibility(file.id, "public", { actorUserId: access.actorUserId, tx });
      coverFileId = file.id;
    }
    const values = {
      institutionKind: input.institutionKind ?? null,
      accreditationBodies: input.accreditationBodies,
      affiliation: input.affiliation ?? null,
      establishedYear: input.establishedYear ?? null,
      studentCapacity: input.studentCapacity ?? null,
      campusAddress: input.campusAddress ?? null,
      aboutHtml: sanitizeRichText(input.aboutHtml) || null,
      coverFileId,
      placementOfficerName: input.placementOfficerName ?? null,
      placementOfficerEmail: input.placementOfficerEmail ?? null,
      placementOfficerPhone: input.placementOfficerPhone ?? null,
    };
    await tx.insert(institutionProfiles).values({ organizationId, ...values }).onConflictDoUpdate({ target: institutionProfiles.organizationId, set: values });
    await audit({
      action: "institution.profile_updated",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      actorUserId: access.actorUserId,
      actorType: access.via === "staff" ? "staff" : "user",
      tx,
    });
  });
}

/**
 * Staff (orgs.verify) authorise or withdraw an institution as an issuer of accredited certificates after
 * checking its accreditation documents. Authorising requires a verified organisation and a scope;
 * `authorisedUntil` (e.g. the accreditation expiry) makes it lapse automatically.
 */
export async function setCertificateIssuerAuthorisation(staff: StaffContext, input: IssuerAuthorisationInput, now: Date = new Date()): Promise<void> {
  assertStaff(staff, "orgs.verify");
  await db.transaction(async (tx) => {
    const { organization: org } = await authorizeOrg(staff, input.organizationId, { member: null, staff: "orgs.verify", types: INSTITUTION_ONLY }, { tx, lock: true });
    if (input.authorised) {
      if (!hasValidVerification(org, now)) throw invalidStateError("Verify the institution before authorising it to issue certificates.");
      if (input.authorisedUntil && input.authorisedUntil < toIsoDate(now)) throw invalidStateError("The authorisation end date is in the past.");
    }
    const values = input.authorised
      ? {
          isAuthorisedCertificateIssuer: true,
          authorisedIssuerScope: input.scope ?? null,
          authorisedByUserId: staff.user.id,
          authorisedAt: now,
          authorisedUntil: input.authorisedUntil ?? null,
        }
      : { isAuthorisedCertificateIssuer: false };
    await tx
      .insert(institutionProfiles)
      .values({ organizationId: org.id, ...values })
      .onConflictDoUpdate({ target: institutionProfiles.organizationId, set: values });
    await audit({
      action: input.authorised ? "institution.issuer_authorised" : "institution.issuer_authorisation_withdrawn",
      entityType: "organization",
      entityId: org.id,
      organizationId: org.id,
      actorUserId: staff.user.id,
      actorType: "staff",
      metadata: { scope: input.scope ?? null, authorisedUntil: input.authorisedUntil ?? null, note: input.note ?? null },
      tx,
    });
  });
}

function publicImage(file: typeof files.$inferSelect | null | undefined) {
  if (!file || file.visibility !== "public" || file.deletedAt || file.scanStatus === "infected") return null;
  return { url: fileUrl(file, { variant: "lg" }), thumbnailUrl: thumbnailUrl(file) };
}

/** Public institution page data (verified institutions with the public page enabled only). */
export async function getPublicInstitution(slug: string, now: Date = new Date()): Promise<PublicInstitution | null> {
  const listable: SQL = and(
    eq(organizations.slug, slug),
    eq(organizations.type, "institution"),
    eq(organizations.status, "verified"),
    eq(organizations.isPublic, true),
    isNull(organizations.deletedAt),
    or(isNull(organizations.verificationExpiresAt), gt(organizations.verificationExpiresAt, now)),
  )!;
  const [row] = await db
    .select({ org: organizations, profile: institutionProfiles })
    .from(organizations)
    .leftJoin(institutionProfiles, eq(institutionProfiles.organizationId, organizations.id))
    .where(listable)
    .limit(1);
  if (!row) return null;
  const ids = [row.org.logoFileId, row.profile?.coverFileId].filter((v): v is string => !!v);
  const fileRows = ids.length ? await db.select().from(files).where(or(...ids.map((id) => eq(files.id, id)))) : [];
  const byId = new Map(fileRows.map((f) => [f.id, f]));
  const [courseCount] = await db
    .select({ value: count() })
    .from(courses)
    .where(and(eq(courses.organizationId, row.org.id), eq(courses.status, "published"), isNull(courses.deletedAt)));
  const authorised = isAuthorisedIssuerNow(row.profile, now);
  return {
    id: row.org.id,
    slug: row.org.slug,
    name: row.org.name,
    description: row.org.description,
    websiteUrl: row.org.websiteUrl,
    countryCode: row.org.countryCode,
    city: row.org.city,
    logo: row.org.logoFileId ? publicImage(byId.get(row.org.logoFileId)) : null,
    cover: row.profile?.coverFileId ? publicImage(byId.get(row.profile.coverFileId)) : null,
    verifiedAt: row.org.verifiedAt,
    institutionKind: row.profile?.institutionKind ?? null,
    declaredAccreditationBodies: row.profile?.accreditationBodies ?? [],
    declaredAffiliation: row.profile?.affiliation ?? null,
    establishedYear: row.profile?.establishedYear ?? null,
    aboutHtml: row.profile?.aboutHtml ?? null,
    authorisedCertificateIssuer: authorised ? { scope: row.profile?.authorisedIssuerScope ?? null, until: row.profile?.authorisedUntil ?? null } : null,
    publishedCourseCount: courseCount?.value ?? 0,
  };
}
