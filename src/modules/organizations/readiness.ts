import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import type { DbOrTx } from "@/db";
import { companyProfiles, institutionProfiles, organizationDocuments, partnerLicences, partnerProfiles, partnerTerritories } from "@/db/schema";

import type { OrganizationRow } from "./access";
import { evaluateVerificationReadiness, type VerificationReadiness } from "./rules";

export type OrganizationDocumentRow = typeof organizationDocuments.$inferSelect;
export type PartnerLicenceRow = typeof partnerLicences.$inferSelect;
export type PartnerTerritoryRow = typeof partnerTerritories.$inferSelect;
export type CompanyProfileRow = typeof companyProfiles.$inferSelect;
export type PartnerProfileRow = typeof partnerProfiles.$inferSelect;
export type InstitutionProfileRow = typeof institutionProfiles.$inferSelect;

export type VerificationContext = {
  documents: OrganizationDocumentRow[];
  licences: PartnerLicenceRow[];
  territories: PartnerTerritoryRow[];
  companyProfile: CompanyProfileRow | null;
  partnerProfile: PartnerProfileRow | null;
  institutionProfile: InstitutionProfileRow | null;
  readiness: VerificationReadiness;
};

/** Everything the verification checklist needs for one organisation, plus the evaluated readiness. */
export async function loadVerificationContext(tx: DbOrTx, org: OrganizationRow, now: Date = new Date()): Promise<VerificationContext> {
  const documents = await tx
    .select()
    .from(organizationDocuments)
    .where(eq(organizationDocuments.organizationId, org.id))
    .orderBy(asc(organizationDocuments.createdAt));

  let licences: PartnerLicenceRow[] = [];
  let territories: PartnerTerritoryRow[] = [];
  let companyProfile: CompanyProfileRow | null = null;
  let partnerProfile: PartnerProfileRow | null = null;
  let institutionProfile: InstitutionProfileRow | null = null;

  if (org.type === "recruitment_partner") {
    [partnerProfile = null] = await tx.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, org.id)).limit(1);
    licences = await tx
      .select()
      .from(partnerLicences)
      .where(and(eq(partnerLicences.organizationId, org.id), isNull(partnerLicences.deletedAt)))
      .orderBy(asc(partnerLicences.createdAt));
    territories = await tx.select().from(partnerTerritories).where(eq(partnerTerritories.organizationId, org.id)).orderBy(asc(partnerTerritories.countryCode));
  } else if (org.type === "institution") {
    [institutionProfile = null] = await tx.select().from(institutionProfiles).where(eq(institutionProfiles.organizationId, org.id)).limit(1);
  } else {
    [companyProfile = null] = await tx.select().from(companyProfiles).where(eq(companyProfiles.organizationId, org.id)).limit(1);
  }

  const readiness = evaluateVerificationReadiness({
    type: org.type,
    organization: { name: org.name, countryCode: org.countryCode, city: org.city, email: org.email, phone: org.phone },
    documents: documents.map((d) => ({ documentType: d.documentType, reviewStatus: d.reviewStatus, expiresAt: d.expiresAt })),
    partner:
      org.type === "recruitment_partner"
        ? {
            businessType: partnerProfile?.businessType ?? null,
            servicesProvided: partnerProfile?.servicesProvided ?? [],
            territories: territories.map((t) => ({ countryCode: t.countryCode, scope: t.scope })),
            licences,
          }
        : null,
    institution: org.type === "institution" ? { institutionKind: institutionProfile?.institutionKind ?? null } : null,
    now,
  });

  return { documents, licences, territories, companyProfile, partnerProfile, institutionProfile, readiness };
}
