"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { getRequestMeta } from "@/lib/request";
import { f } from "@/lib/validation";
import { requireOrgMember, requireStaff } from "@/modules/identity/authz";

import {
  acceptPartnerAgreement,
  addPartnerLicence,
  addPartnerTerritory,
  deletePartnerLicence,
  expirePartnerLicence,
  issuePartnerAgreement,
  issuePartnerAgreementToPartners,
  rejectPartnerLicence,
  removePartnerTerritory,
  setPartnerStatusNotes,
  setTerritoryAuthorisation,
  terminatePartnerAgreement,
  updatePartnerLicence,
  updatePartnerProfile,
  updatePartnerTerritory,
  verifyPartnerLicence,
} from "./partner";
import { adminOrganizationPath, ADMIN_ORGANIZATIONS_PATH, ORG_PROFILE_PATH } from "./paths";
import {
  acceptPartnerAgreementSchema,
  expireLicenceSchema,
  partnerAgreementSchema,
  partnerLicenceSchema,
  partnerProfileSchema,
  partnerStatusNotesSchema,
  partnerTerritorySchema,
  rejectLicenceSchema,
  terminatePartnerAgreementSchema,
  territoryAuthorisationSchema,
  uuidList,
  verifyLicenceSchema,
} from "./schemas";

/** Server Actions for the Recruitment Partner Portal profile and the matching staff tools. */

const PROFILE_PATH = ORG_PROFILE_PATH.recruitment_partner;

export const updatePartnerProfileAction = createFormAction(partnerProfileSchema, async (input) => {
  const ctx = await requireOrgMember("recruitment_partner");
  await updatePartnerProfile(ctx, ctx.organization.id, input);
  revalidatePath(PROFILE_PATH);
  return ok(undefined, "Agency profile saved.");
});

export const addPartnerLicenceAction = createFormAction(partnerLicenceSchema, async (input) => {
  const ctx = await requireOrgMember("recruitment_partner");
  const row = await addPartnerLicence(ctx, ctx.organization.id, input);
  revalidatePath(PROFILE_PATH);
  return ok({ id: row.id }, "Licence added. Venkat Sai will verify it.");
});

export const updatePartnerLicenceAction = createFormAction(partnerLicenceSchema.and(z.object({ licenceId: f.uuid() })), async ({ licenceId, ...input }) => {
  const ctx = await requireOrgMember("recruitment_partner");
  await updatePartnerLicence(ctx, licenceId, input);
  revalidatePath(PROFILE_PATH);
  return ok(undefined, "Licence updated and sent for review.");
});

export const deletePartnerLicenceAction = createAction(z.object({ licenceId: f.uuid() }), async ({ licenceId }) => {
  const ctx = await requireOrgMember("recruitment_partner");
  await deletePartnerLicence(ctx, licenceId);
  revalidatePath(PROFILE_PATH);
  return ok(undefined, "Licence removed.");
});

export const acceptPartnerAgreementAction = createFormAction(acceptPartnerAgreementSchema, async ({ agreementId, acceptedByName }) => {
  const ctx = await requireOrgMember("recruitment_partner");
  const meta = await getRequestMeta();
  await acceptPartnerAgreement(ctx, { agreementId, acceptedByName }, { ipHash: meta.ipHash, userAgent: meta.userAgent });
  revalidatePath(PROFILE_PATH);
  return ok(undefined, "Agreement accepted.");
});

export const addPartnerTerritoryAction = createFormAction(partnerTerritorySchema, async (input) => {
  const ctx = await requireOrgMember("recruitment_partner");
  await addPartnerTerritory(ctx, ctx.organization.id, input);
  revalidatePath(PROFILE_PATH);
  return ok(undefined, "Territory added.");
});

export const updatePartnerTerritoryAction = createFormAction(partnerTerritorySchema.extend({ territoryId: f.uuid() }), async ({ territoryId, ...input }) => {
  const ctx = await requireOrgMember("recruitment_partner");
  await updatePartnerTerritory(ctx, territoryId, input);
  revalidatePath(PROFILE_PATH);
  return ok(undefined, "Territory updated.");
});

export const removePartnerTerritoryAction = createAction(z.object({ territoryId: f.uuid() }), async ({ territoryId }) => {
  const ctx = await requireOrgMember("recruitment_partner");
  await removePartnerTerritory(ctx, territoryId);
  revalidatePath(PROFILE_PATH);
  return ok(undefined, "Territory removed.");
});

// ---------------------------------------------------------------------------
// Command Centre
// ---------------------------------------------------------------------------

export const verifyPartnerLicenceAction = createAction(verifyLicenceSchema, async (input) => {
  const staff = await requireStaff("orgs.verify");
  await verifyPartnerLicence(staff, input);
  revalidatePath(ADMIN_ORGANIZATIONS_PATH, "layout");
  return ok(undefined, "Licence verified.");
});

export const rejectPartnerLicenceAction = createFormAction(rejectLicenceSchema, async (input) => {
  const staff = await requireStaff("orgs.verify");
  await rejectPartnerLicence(staff, input);
  revalidatePath(ADMIN_ORGANIZATIONS_PATH, "layout");
  return ok(undefined, "Licence rejected.");
});

export const expirePartnerLicenceAction = createAction(expireLicenceSchema, async (input) => {
  const staff = await requireStaff("orgs.verify");
  await expirePartnerLicence(staff, input);
  revalidatePath(ADMIN_ORGANIZATIONS_PATH, "layout");
  return ok(undefined, "Licence marked as expired.");
});

export const issuePartnerAgreementAction = createFormAction(partnerAgreementSchema.and(z.object({ organizationId: f.uuid() })), async ({ organizationId, ...input }) => {
  const staff = await requireStaff("partners.manage");
  const row = await issuePartnerAgreement(staff, organizationId, input);
  revalidatePath(adminOrganizationPath(organizationId));
  return ok({ id: row.id }, "Agreement issued. The partner has been asked to accept it.");
});

export const issuePartnerAgreementToPartnersAction = createFormAction(
  partnerAgreementSchema.and(z.object({ organizationIds: uuidList(1000) })),
  async ({ organizationIds, ...input }) => {
    const staff = await requireStaff("partners.manage");
    const result = await issuePartnerAgreementToPartners(staff, input, { organizationIds: organizationIds.length ? organizationIds : undefined });
    revalidatePath(ADMIN_ORGANIZATIONS_PATH, "layout");
    return ok(result, `Issued to ${result.issued} partner(s)${result.skipped ? `; ${result.skipped} already had this version` : ""}.`);
  },
);

export const terminatePartnerAgreementAction = createFormAction(terminatePartnerAgreementSchema, async (input) => {
  const staff = await requireStaff("partners.manage");
  await terminatePartnerAgreement(staff, input);
  revalidatePath(ADMIN_ORGANIZATIONS_PATH, "layout");
  return ok(undefined, "Agreement terminated.");
});

export const setTerritoryAuthorisationAction = createAction(territoryAuthorisationSchema, async (input) => {
  const staff = await requireStaff("partners.manage");
  await setTerritoryAuthorisation(staff, input);
  revalidatePath(ADMIN_ORGANIZATIONS_PATH, "layout");
  return ok(undefined, input.isAuthorised ? "Territory authorised." : "Territory authorisation withdrawn.");
});

export const setPartnerStatusNotesAction = createFormAction(partnerStatusNotesSchema, async ({ organizationId, statusNotes }) => {
  const staff = await requireStaff("partners.manage");
  await setPartnerStatusNotes(staff, organizationId, statusNotes ?? null);
  revalidatePath(adminOrganizationPath(organizationId));
  return ok(undefined, "Notes saved.");
});
