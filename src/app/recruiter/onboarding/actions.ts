"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertPortalEnabled } from "@/components/layout/shell-data";
import { ActionError, createFormAction } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { f } from "@/lib/validation";
import { getOrgContext } from "@/modules/identity/authz";
import { getCurrentSession, requireUser, setActiveOrganization } from "@/modules/identity/session";
import { PARTNER_BUSINESS_TYPES, PARTNER_TERRITORY_SCOPES } from "@/modules/organizations/constants";
import { updateMemberDetails } from "@/modules/organizations/members";
import { addPartnerTerritory, updatePartnerProfile } from "@/modules/organizations/partner";
import { countryCodeList, organizationDetailsSchema, partnerProfileSchema } from "@/modules/organizations/schemas";
import { createOrganization } from "@/modules/organizations/service";

const confirmation = (message: string) => z.preprocess((v) => v === "true" || v === "on" || v === true, z.literal(true, { error: message }));

const onboardingSchema = organizationDetailsSchema.extend({
  businessType: f.enumOf(PARTNER_BUSINESS_TYPES, "Choose your business type"),
  servicesProvided: partnerProfileSchema.shape.servicesProvided,
  yearsInOperation: partnerProfileSchema.shape.yearsInOperation,
  territoryCountries: countryCodeList(30),
  territoryScope: f.enumOf(PARTNER_TERRITORY_SCOPES, "Choose what you do in these countries"),
  /** The signed-in person's designation; saved on their membership as the agency's contact person. */
  representativeTitle: f.text({ max: 120, label: "Your designation" }),
  confirmAuthorised: confirmation("Confirm that you are authorised to register this agency"),
  confirmNoCandidateFees: confirmation("Confirm that candidates submitted through Venkat Sai Global are never charged"),
});

/**
 * Create the recruitment partner organisation owned by the signed-in user (status draft), save the
 * declared business type, services and territories, make it the active partner workspace and open the
 * agency profile, where licences, documents, the agreement and verification continue.
 */
export const createPartnerOrganizationAction = createFormAction(onboardingSchema, async (input) => {
  const user = await requireUser({ returnTo: "/recruiter/onboarding" });
  await assertPortalEnabled("recruiter");
  const limited = await rateLimit(`org-create:${user.id}`, 5, 24 * 60 * 60);
  if (!limited.allowed) throw new ActionError("You have created several organisations today. Contact Venkat Sai support if you need more.");

  const { businessType, servicesProvided, yearsInOperation, territoryCountries, territoryScope, representativeTitle, confirmAuthorised: _a, confirmNoCandidateFees: _b, ...details } = input;
  void _a;
  void _b;
  const org = await createOrganization("recruitment_partner", details, user);
  const current = await getCurrentSession();
  if (current) await setActiveOrganization(current.session.id, "recruitment_partner", org.id);

  // The workspace exists from here on; anything that fails below can be completed on the agency profile.
  try {
    const ctx = await getOrgContext("recruitment_partner");
    if (ctx && ctx.organization.id === org.id) {
      await updatePartnerProfile(ctx, org.id, { businessType, servicesProvided, yearsInOperation, specialisations: [], industryIds: [] });
      for (const countryCode of territoryCountries) {
        await addPartnerTerritory(ctx, org.id, { countryCode, scope: territoryScope }).catch((error: unknown) => logger.warn("Could not add a declared territory", { error, organizationId: org.id, countryCode }));
      }
      await updateMemberDetails(ctx, { memberId: ctx.membership.id, jobTitle: representativeTitle }).catch((error: unknown) => logger.warn("Could not save the representative designation", { error, organizationId: org.id }));
    }
  } catch (error) {
    logger.warn("Partner onboarding follow-up failed", { error, organizationId: org.id });
  }

  revalidatePath("/recruiter", "layout");
  redirect("/recruiter/profile?welcome=1");
});
