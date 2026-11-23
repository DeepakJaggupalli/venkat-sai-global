import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { organizationMembers, organizations, roles } from "@/db/schema";
import { logger } from "@/lib/logger";
import type { OrgContext } from "@/modules/identity/authz";
import type { SessionUser } from "@/modules/identity/session";

import type { OrganizationRow } from "./access";
import { updateCompanyProfile } from "./employer";
import { updateInstitutionProfile } from "./institution";
import { updateMemberDetails } from "./members";
import { addPartnerLicence, updatePartnerProfile } from "./partner";
import { companyProfileSchema, institutionProfileSchema, partnerLicenceSchema, partnerProfileSchema, signupOrganizationSchema, type SignupOrganizationInput } from "./schemas";
import { createOrganization } from "./service";

/**
 * Organisation sign-up: the organisation entered on the sign-up form is created when the new owner verifies their
 * contact (createOrganization requires an active owner, so unverified sign-ups never leave organisations behind).
 * It goes through the same services as the onboarding pages: the organisation starts as a draft, then the declared
 * profile details, the owner's designation and (partners) the declared licence are saved as onboarding saves them.
 */

/** The stored sign-up details, or null when absent or no longer valid. */
export function parseSignupOrganization(value: unknown): SignupOrganizationInput | null {
  const parsed = signupOrganizationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Owner context for the organisation just created (there is no session yet while the sign-up completes). */
async function ownerContext(user: SessionUser, organizationId: string): Promise<OrgContext | null> {
  const [row] = await db
    .select({ member: organizationMembers, org: organizations, role: roles })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
    .where(and(eq(organizationMembers.userId, user.id), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  return {
    orgType: row.org.type,
    user,
    sessionId: "",
    organization: row.org,
    membership: { id: row.member.id, status: row.member.status, jobTitle: row.member.jobTitle, department: row.member.department },
    role: { id: row.role.id, key: row.role.key, name: row.role.name },
    permissions: new Set(row.role.permissions),
    isOwner: true,
  };
}

/** Create the signed-up organisation owned by `user` (status draft) and save the declared details. */
export async function createSignupOrganization(user: SessionUser, input: SignupOrganizationInput): Promise<OrganizationRow> {
  const org = await createOrganization(input.type, input.details, user, input.employerKind ? { employerKind: input.employerKind } : {});

  // The organisation exists from here on; anything below can be completed from the portal profile.
  const followUp = async (what: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      logger.warn(`Sign-up organisation: could not save the ${what}`, { error, organizationId: org.id });
    }
  };
  const ctx = await ownerContext(user, org.id);
  if (!ctx) return org;

  await followUp("designation", () => updateMemberDetails(ctx, { memberId: ctx.membership.id, jobTitle: input.representativeTitle }));
  if (input.type === "employer" && input.companySize) {
    await followUp("company size", () => updateCompanyProfile(ctx, org.id, companyProfileSchema.parse({ companySize: input.companySize })));
  }
  if (input.type === "recruitment_partner") {
    if (input.partnerBusinessType) {
      await followUp("business type", () => updatePartnerProfile(ctx, org.id, partnerProfileSchema.parse({ businessType: input.partnerBusinessType })));
    }
    if (input.licenceNumber) {
      const country = input.details.countryCode;
      await followUp("licence", () =>
        addPartnerLicence(
          ctx,
          org.id,
          partnerLicenceSchema.parse({
            licenceType: country === "IN" ? "india_recruiting_agent" : "foreign_recruitment_licence",
            licenceNumber: input.licenceNumber,
            issuingCountryCode: country,
          }),
        ),
      );
    }
  }
  if (input.type === "institution" && input.institutionKind) {
    await followUp("institution kind", () => updateInstitutionProfile(ctx, org.id, institutionProfileSchema.parse({ institutionKind: input.institutionKind })));
  }
  return org;
}
