"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireOrgMember, requireStaff } from "@/modules/identity/authz";

import {
  activateEmployerContract,
  createBranch,
  createEmployerContract,
  setBranchActive,
  terminateEmployerContract,
  updateBranch,
  updateCompanyProfile,
  updateEmployerContract,
} from "./employer";
import { adminOrganizationPath, ADMIN_ORGANIZATIONS_PATH, ORG_PROFILE_PATH } from "./paths";
import { companyBranchSchema, companyProfileSchema, employerContractSchema, terminateContractSchema } from "./schemas";

/** Server Actions for the Employer Portal company profile / branches and staff contract management. */

const PROFILE_PATH = ORG_PROFILE_PATH.employer;

export const updateCompanyProfileAction = createFormAction(companyProfileSchema, async (input) => {
  const ctx = await requireOrgMember("employer");
  await updateCompanyProfile(ctx, ctx.organization.id, input);
  revalidatePath(PROFILE_PATH);
  return ok(undefined, "Company profile saved.");
});

export const createBranchAction = createFormAction(companyBranchSchema, async (input) => {
  const ctx = await requireOrgMember("employer");
  const row = await createBranch(ctx, ctx.organization.id, input);
  revalidatePath(PROFILE_PATH);
  return ok({ id: row.id }, "Branch added.");
});

export const updateBranchAction = createFormAction(companyBranchSchema.extend({ branchId: f.uuid() }), async ({ branchId, ...input }) => {
  const ctx = await requireOrgMember("employer");
  await updateBranch(ctx, branchId, input);
  revalidatePath(PROFILE_PATH);
  return ok(undefined, "Branch saved.");
});

export const setBranchActiveAction = createAction(z.object({ branchId: f.uuid(), isActive: z.boolean() }), async ({ branchId, isActive }) => {
  const ctx = await requireOrgMember("employer");
  await setBranchActive(ctx, branchId, isActive);
  revalidatePath(PROFILE_PATH);
  return ok(undefined, isActive ? "Branch reactivated." : "Branch deactivated.");
});

// ---------------------------------------------------------------------------
// Command Centre: contracts
// ---------------------------------------------------------------------------

export const createEmployerContractAction = createFormAction(employerContractSchema.and(z.object({ organizationId: f.uuid() })), async ({ organizationId, ...input }) => {
  const staff = await requireStaff("orgs.manage");
  const row = await createEmployerContract(staff, organizationId, input);
  revalidatePath(adminOrganizationPath(organizationId));
  return ok({ id: row.id }, "Contract saved as a draft.");
});

export const updateEmployerContractAction = createFormAction(employerContractSchema.and(z.object({ contractId: f.uuid() })), async ({ contractId, ...input }) => {
  const staff = await requireStaff("orgs.manage");
  await updateEmployerContract(staff, contractId, input);
  revalidatePath(ADMIN_ORGANIZATIONS_PATH, "layout");
  return ok(undefined, "Contract saved.");
});

export const activateEmployerContractAction = createAction(z.object({ contractId: f.uuid() }), async ({ contractId }) => {
  const staff = await requireStaff("orgs.manage");
  await activateEmployerContract(staff, contractId);
  revalidatePath(ADMIN_ORGANIZATIONS_PATH, "layout");
  return ok(undefined, "Contract activated.");
});

export const terminateEmployerContractAction = createFormAction(terminateContractSchema, async (input) => {
  const staff = await requireStaff("orgs.manage");
  await terminateEmployerContract(staff, input);
  revalidatePath(ADMIN_ORGANIZATIONS_PATH, "layout");
  return ok(undefined, "Contract terminated.");
});
