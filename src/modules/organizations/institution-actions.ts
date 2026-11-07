"use server";

import { revalidatePath } from "next/cache";

import { createFormAction, ok } from "@/lib/actions";
import { requireOrgMember, requireStaff } from "@/modules/identity/authz";

import { setCertificateIssuerAuthorisation, updateInstitutionProfile } from "./institution";
import { adminOrganizationPath, ORG_PROFILE_PATH } from "./paths";
import { institutionProfileSchema, issuerAuthorisationSchema } from "./schemas";

/** Server Actions for the institution profile and the staff certificate-issuer authorisation. */

export const updateInstitutionProfileAction = createFormAction(institutionProfileSchema, async (input) => {
  const ctx = await requireOrgMember("institution");
  await updateInstitutionProfile(ctx, ctx.organization.id, input);
  revalidatePath(ORG_PROFILE_PATH.institution);
  return ok(undefined, "Institution profile saved.");
});

export const setCertificateIssuerAuthorisationAction = createFormAction(issuerAuthorisationSchema, async (input) => {
  const staff = await requireStaff("orgs.verify");
  await setCertificateIssuerAuthorisation(staff, input);
  revalidatePath(adminOrganizationPath(input.organizationId));
  return ok(undefined, input.authorised ? "The institution is authorised to issue accredited certificates." : "Certificate-issuer authorisation withdrawn.");
});
