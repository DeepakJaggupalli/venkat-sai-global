"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireOrgMember } from "@/modules/identity/authz";
import { createBranch, setBranchActive, updateBranch, updateCompanyProfile } from "@/modules/organizations/employer";
import { companyBranchSchema, companyProfileSchema, organizationDetailsSchema, organizationDocumentSchema, socialLinksSchema } from "@/modules/organizations/schemas";
import {
  addOrganizationDocument,
  removeOrganizationDocument,
  setOrganizationLogo,
  setOrganizationPublic,
  submitVerification,
  updateOrganization,
} from "@/modules/organizations/service";

/**
 * Company profile, branding, branches and verification for the active employer organisation.
 * Every action re-authorises with employer.company.manage; the organisations module re-checks scope.
 */
const guard = () => requireOrgMember("employer", "employer.company.manage");

function refreshCompany(): void {
  revalidatePath("/employer/company");
  revalidatePath("/employer/company/verification");
  revalidatePath("/employer");
}

export const updateCompanyDetailsAction = createFormAction(organizationDetailsSchema, async (input) => {
  const ctx = await guard();
  await updateOrganization(ctx, ctx.organization.id, input);
  refreshCompany();
  return ok(undefined, "Company details saved.");
});

const profileFormSchema = companyProfileSchema.omit({ socialLinks: true }).extend(socialLinksSchema.shape);

export const updateCompanyProfileAction = createFormAction(profileFormSchema, async (input) => {
  const ctx = await guard();
  const { linkedin, facebook, instagram, x, youtube, whatsapp, ...profile } = input;
  await updateCompanyProfile(ctx, ctx.organization.id, { ...profile, socialLinks: { linkedin, facebook, instagram, x, youtube, whatsapp } });
  refreshCompany();
  return ok(undefined, "Company profile saved.");
});

export const setCompanyLogoAction = createAction(z.object({ fileId: f.uuid().nullable() }), async ({ fileId }) => {
  const ctx = await guard();
  await setOrganizationLogo(ctx, ctx.organization.id, fileId);
  revalidatePath("/employer", "layout");
  return ok(undefined, fileId ? "Logo updated." : "Logo removed.");
});

export const setPublicPageAction = createAction(z.object({ isPublic: z.boolean() }), async ({ isPublic }) => {
  const ctx = await guard();
  await setOrganizationPublic(ctx, ctx.organization.id, isPublic);
  refreshCompany();
  return ok(undefined, isPublic ? "Public page switched on. It is shown while your company is verified." : "Public page switched off.");
});

export const saveBranchAction = createFormAction(companyBranchSchema.extend({ branchId: f.optionalUuid() }), async ({ branchId, ...input }) => {
  const ctx = await guard();
  if (branchId) {
    await updateBranch(ctx, branchId, input);
  } else {
    await createBranch(ctx, ctx.organization.id, input);
  }
  refreshCompany();
  return ok(undefined, branchId ? "Branch saved." : "Branch added.");
});

export const setBranchActiveAction = createAction(z.object({ branchId: z.uuid(), isActive: z.boolean() }), async ({ branchId, isActive }) => {
  const ctx = await guard();
  await setBranchActive(ctx, branchId, isActive);
  refreshCompany();
  return ok(undefined, isActive ? "Branch reactivated." : "Branch deactivated.");
});

export const addCompanyDocumentAction = createFormAction(organizationDocumentSchema, async (input) => {
  const ctx = await guard();
  await addOrganizationDocument(ctx, ctx.organization.id, input);
  refreshCompany();
  return ok(undefined, "Document added.");
});

export const removeCompanyDocumentAction = createAction(z.object({ documentId: z.uuid() }), async ({ documentId }) => {
  const ctx = await guard();
  await removeOrganizationDocument(ctx, documentId);
  refreshCompany();
  return ok(undefined, "Document removed.");
});

export const submitCompanyVerificationAction = createAction(z.object({}), async () => {
  const ctx = await guard();
  const result = await submitVerification(ctx);
  revalidatePath("/employer", "layout");
  return ok(
    { renewal: result.renewal, code: result.approvalCode },
    result.renewal ? "Renewal submitted. Your company stays verified while we review it." : "Submitted for verification. We will email you when the review is complete.",
  );
});
