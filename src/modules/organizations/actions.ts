"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { f } from "@/lib/validation";
import { requireOrgMember, requireStaff } from "@/modules/identity/authz";
import { getCurrentSession, requireUser, setActiveOrganization } from "@/modules/identity/session";

import { adminOrganizationPath, ADMIN_ORGANIZATIONS_PATH, ORG_PORTAL_PATH, ORG_PROFILE_PATH } from "./paths";
import {
  addOrganizationDocumentSchema,
  createOrganizationSchema,
  expireVerificationSchema,
  orgTypeField,
  reactivateOrganizationSchema,
  reviewOrganizationDocumentSchema,
  setOrganizationLogoSchema,
  setOrganizationPublicSchema,
  staffUpdateOrganizationSchema,
  suspendOrganizationSchema,
  updateOrganizationSchema,
} from "./schemas";
import {
  addOrganizationDocument,
  createOrganization,
  expireOrganizationVerification,
  reactivateOrganization,
  removeOrganizationDocument,
  reviewOrganizationDocument,
  setAccountManager,
  setOrganizationLogo,
  setOrganizationPublic,
  submitVerification,
  suspendOrganization,
  updateOrganization,
} from "./service";

/**
 * Server Actions for organisation details, documents, verification and staff administration.
 * Thin: authorise → validate → call the service → revalidate. Portal forms send `orgType`
 * (the portal) and act on the active organisation of that type; Command Centre forms send
 * `organizationId` and require the staff permission.
 */

/** Onboarding: create an organisation owned by the signed-in user, make it active and open its portal. */
export const createOrganizationAction = createFormAction(createOrganizationSchema, async (input) => {
  const user = await requireUser();
  const limited = await rateLimit(`org-create:${user.id}`, 5, 24 * 60 * 60);
  if (!limited.allowed) throw new ActionError("You have created several organisations today. Contact Venkat Sai support if you need more.");
  const { type, ...details } = input;
  const org = await createOrganization(type, details, user);
  const current = await getCurrentSession();
  if (current) await setActiveOrganization(current.session.id, type, org.id);
  revalidatePath(ORG_PORTAL_PATH[type], "layout");
  redirect(ORG_PROFILE_PATH[type]);
});

export const updateOrganizationAction = createFormAction(updateOrganizationSchema, async (input) => {
  const { orgType, ...details } = input;
  const ctx = await requireOrgMember(orgType);
  await updateOrganization(ctx, ctx.organization.id, details);
  revalidatePath(ORG_PROFILE_PATH[orgType]);
  return ok(undefined, "Organisation details saved.");
});

export const staffUpdateOrganizationAction = createFormAction(staffUpdateOrganizationSchema, async (input) => {
  const staff = await requireStaff("orgs.manage");
  const { organizationId, ...details } = input;
  await updateOrganization(staff, organizationId, details);
  revalidatePath(adminOrganizationPath(organizationId));
  return ok(undefined, "Organisation details saved.");
});

export const setOrganizationLogoAction = createAction(setOrganizationLogoSchema, async ({ orgType, fileId }) => {
  const ctx = await requireOrgMember(orgType);
  await setOrganizationLogo(ctx, ctx.organization.id, fileId);
  revalidatePath(ORG_PORTAL_PATH[orgType], "layout");
  return ok(undefined, fileId ? "Logo updated." : "Logo removed.");
});

export const setOrganizationPublicAction = createAction(setOrganizationPublicSchema, async ({ orgType, isPublic }) => {
  const ctx = await requireOrgMember(orgType);
  await setOrganizationPublic(ctx, ctx.organization.id, isPublic);
  revalidatePath(ORG_PROFILE_PATH[orgType]);
  return ok(undefined, isPublic ? "Your public page is switched on. It is shown while your organisation is verified." : "Your public page is switched off.");
});

export const addOrganizationDocumentAction = createFormAction(addOrganizationDocumentSchema, async (input) => {
  const { orgType, ...doc } = input;
  const ctx = await requireOrgMember(orgType);
  const row = await addOrganizationDocument(ctx, ctx.organization.id, doc);
  revalidatePath(ORG_PROFILE_PATH[orgType]);
  return ok({ id: row.id }, "Document added.");
});

export const removeOrganizationDocumentAction = createAction(z.object({ orgType: orgTypeField, documentId: f.uuid() }), async ({ orgType, documentId }) => {
  const ctx = await requireOrgMember(orgType);
  await removeOrganizationDocument(ctx, documentId);
  revalidatePath(ORG_PROFILE_PATH[orgType]);
  return ok(undefined, "Document removed.");
});

export const submitVerificationAction = createAction(z.object({ orgType: orgTypeField }), async ({ orgType }) => {
  const ctx = await requireOrgMember(orgType);
  const result = await submitVerification(ctx);
  revalidatePath(ORG_PORTAL_PATH[orgType], "layout");
  return ok(result, result.renewal ? "Renewal submitted. Your organisation stays verified while we review it." : "Submitted for verification. We will email you when the review is complete.");
});

// ---------------------------------------------------------------------------
// Command Centre
// ---------------------------------------------------------------------------

export const reviewOrganizationDocumentAction = createAction(reviewOrganizationDocumentSchema, async (input) => {
  const staff = await requireStaff("orgs.verify");
  await reviewOrganizationDocument(staff, input);
  revalidatePath(ADMIN_ORGANIZATIONS_PATH, "layout");
  return ok(undefined, input.reviewStatus === "accepted" ? "Document accepted." : "Document rejected.");
});

export const suspendOrganizationAction = createFormAction(suspendOrganizationSchema, async ({ organizationId, reason }) => {
  const staff = await requireStaff("orgs.manage");
  await suspendOrganization(staff, organizationId, reason);
  revalidatePath(adminOrganizationPath(organizationId));
  return ok(undefined, "Organisation suspended.");
});

export const reactivateOrganizationAction = createFormAction(reactivateOrganizationSchema, async ({ organizationId, note }) => {
  const staff = await requireStaff("orgs.manage");
  const org = await reactivateOrganization(staff, organizationId, note);
  revalidatePath(adminOrganizationPath(organizationId));
  return ok({ status: org.status }, "Organisation reactivated.");
});

export const expireOrganizationVerificationAction = createFormAction(expireVerificationSchema, async ({ organizationId, reason }) => {
  const staff = await requireStaff(["orgs.manage", "orgs.verify"], "any");
  await expireOrganizationVerification(staff, organizationId, reason);
  revalidatePath(adminOrganizationPath(organizationId));
  return ok(undefined, "Verification ended.");
});

export const setAccountManagerAction = createAction(
  z.object({ organizationId: f.uuid(), accountManagerUserId: f.uuid().nullable() }),
  async ({ organizationId, accountManagerUserId }) => {
    const staff = await requireStaff("orgs.manage");
    await setAccountManager(staff, organizationId, accountManagerUserId);
    revalidatePath(adminOrganizationPath(organizationId));
    return ok(undefined, "Account manager updated.");
  },
);
