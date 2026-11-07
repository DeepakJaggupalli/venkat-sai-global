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
import { INSTITUTION_KINDS } from "@/modules/organizations/constants";
import { updateInstitutionProfile } from "@/modules/organizations/institution";
import { updateMemberDetails } from "@/modules/organizations/members";
import { organizationDetailsSchema, textList } from "@/modules/organizations/schemas";
import { createOrganization } from "@/modules/organizations/service";

const onboardingSchema = organizationDetailsSchema.extend({
  institutionKind: f.enumOf(INSTITUTION_KINDS, "Choose the kind of institution"),
  accreditationBodies: textList({ maxItems: 20, maxLength: 200, label: "Accreditation body" }),
  affiliation: f.optionalText(300),
  establishedYear: f.optionalInt({ min: 1800, max: 2100 }),
  placementOfficerName: f.optionalText(120),
  placementOfficerEmail: f.optionalEmail(),
  placementOfficerPhone: f.optionalPhone(),
  representativeTitle: f.text({ max: 120, label: "Your designation" }),
  confirmAuthorised: z.preprocess((v) => v === "true" || v === "on" || v === true, z.literal(true, { error: "Confirm that you are authorised to register this institution" })),
});

/**
 * Create the institution owned by the signed-in user (status draft), save its institution profile
 * (kind, declared accreditation / affiliation, placement contact), make it the active institution
 * workspace and open the dashboard, where the setup checklist continues.
 */
export const createInstitutionAction = createFormAction(onboardingSchema, async (input) => {
  const user = await requireUser({ returnTo: "/institution/onboarding" });
  await assertPortalEnabled("institution");
  const limited = await rateLimit(`org-create:${user.id}`, 5, 24 * 60 * 60);
  if (!limited.allowed) throw new ActionError("You have created several organisations today. Contact Venkat Sai support if you need more.");

  const {
    representativeTitle,
    confirmAuthorised: _confirmed,
    institutionKind,
    accreditationBodies,
    affiliation,
    establishedYear,
    placementOfficerName,
    placementOfficerEmail,
    placementOfficerPhone,
    ...details
  } = input;
  void _confirmed;
  const org = await createOrganization("institution", details, user);
  const current = await getCurrentSession();
  if (current) await setActiveOrganization(current.session.id, "institution", org.id);

  try {
    const ctx = await getOrgContext("institution");
    if (ctx && ctx.organization.id === org.id) {
      await updateInstitutionProfile(ctx, org.id, {
        institutionKind,
        accreditationBodies,
        affiliation,
        establishedYear,
        placementOfficerName,
        placementOfficerEmail,
        placementOfficerPhone,
      });
      await updateMemberDetails(ctx, { memberId: ctx.membership.id, jobTitle: representativeTitle });
    }
  } catch (error) {
    // The workspace exists; the profile can be completed from the profile page.
    logger.warn("Could not save the institution profile during onboarding", { error, organizationId: org.id });
  }

  revalidatePath("/institution", "layout");
  redirect("/institution?welcome=1");
});
