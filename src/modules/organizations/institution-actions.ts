"use server";

import { revalidatePath } from "next/cache";

import { createFormAction, ok } from "@/lib/actions";
import { requireOrgMember, requireStaff } from "@/modules/identity/authz";

import { setCertificateIssuerAuthorisation, updateInstitutionProfile } from "./institution";
import { ADMIN_TRAINING_INSTITUTIONS_PATH, adminOrganizationPath, ORG_PROFILE_PATH } from "./paths";
import { institutionProfileSchema, issuerAuthorisationSchema } from "./schemas";

/** Server Actions for the institution profile and the staff certificate-issuer authorisation. */

export const updateInstitutionProfileAction = createFormAction(institutionProfileSchema, async (input) => {
  const ctx = await requireOrgMember("institution");
  await updateInstitutionProfile(ctx, ctx.organization.id, input);
  revalidatePath(ORG_PROFILE_PATH.institution, "layout");
  revalidatePath(adminOrganizationPath(ctx.organization.id));
  return ok(undefined, "Institution profile saved.");
});

export const setCertificateIssuerAuthorisationAction = createFormAction(issuerAuthorisationSchema, async (input) => {
  const staff = await requireStaff("orgs.verify");
  await setCertificateIssuerAuthorisation(staff, input);
  revalidatePath(adminOrganizationPath(input.organizationId));
  revalidatePath(ADMIN_TRAINING_INSTITUTIONS_PATH, "layout");
  revalidatePath(ORG_PROFILE_PATH.institution, "layout");
  return ok(undefined, input.authorised ? "The institution is authorised to issue accredited certificates." : "Certificate-issuer authorisation withdrawn.");
});
