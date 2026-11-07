"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ActionError, createAction, createFormAction, ok } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { f } from "@/lib/validation";
import { requireOrgMember, requireStaff } from "@/modules/identity/authz";
import { getCurrentSession, requireUser, setActiveOrganization } from "@/modules/identity/session";

import {
  acceptInvitation,
  changeMemberRole,
  createOrgRole,
  deleteOrgRole,
  inviteMember,
  leaveOrganization,
  removeMember,
  resendInvitation,
  revokeInvitation,
  setMemberStatus,
  transferOwnership,
  updateMemberDetails,
  updateOrgRole,
} from "./members";
import { adminOrganizationPath, invitationPath, ORG_TEAM_PATH } from "./paths";
import {
  acceptInvitationSchema,
  changeMemberRoleSchema,
  inviteMemberSchema,
  memberDetailsSchema,
  orgRoleSchema,
  orgTypeField,
  setMemberStatusSchema,
  transferOwnershipSchema,
} from "./schemas";

/** Server Actions for team members, invitations and custom roles (portal + Command Centre). */

const withOrgType = <T extends z.ZodRawShape>(shape: T) => z.object({ orgType: orgTypeField, ...shape });

/** Invitations send email: cap them per organisation (shared by invite and resend). */
async function assertInvitationQuota(organizationId: string): Promise<void> {
  const limited = await rateLimit(`org-invite:${organizationId}`, 50, 24 * 60 * 60);
  if (!limited.allowed) throw new ActionError("Your organisation has sent many invitations today. Please try again tomorrow.");
}

export const inviteMemberAction = createFormAction(inviteMemberSchema.extend({ orgType: orgTypeField }), async ({ orgType, email, roleId }) => {
  const ctx = await requireOrgMember(orgType);
  await assertInvitationQuota(ctx.organization.id);
  await inviteMember(ctx, ctx.organization.id, { email, roleId });
  revalidatePath(ORG_TEAM_PATH[orgType]);
  return ok(undefined, `Invitation sent to ${email}.`);
});

export const staffInviteMemberAction = createFormAction(inviteMemberSchema.extend({ organizationId: f.uuid() }), async ({ organizationId, email, roleId }) => {
  const staff = await requireStaff("orgs.manage");
  await inviteMember(staff, organizationId, { email, roleId });
  revalidatePath(adminOrganizationPath(organizationId));
  return ok(undefined, `Invitation sent to ${email}.`);
});

export const resendInvitationAction = createAction(withOrgType({ invitationId: f.uuid() }), async ({ orgType, invitationId }) => {
  const ctx = await requireOrgMember(orgType);
  await assertInvitationQuota(ctx.organization.id);
  await resendInvitation(ctx, invitationId);
  revalidatePath(ORG_TEAM_PATH[orgType]);
  return ok(undefined, "A new invitation link was sent. The previous link no longer works.");
});

export const revokeInvitationAction = createAction(withOrgType({ invitationId: f.uuid() }), async ({ orgType, invitationId }) => {
  const ctx = await requireOrgMember(orgType);
  await revokeInvitation(ctx, invitationId);
  revalidatePath(ORG_TEAM_PATH[orgType]);
  return ok(undefined, "Invitation cancelled.");
});

/** Accept an invitation (from /invite/<token>) and open the organisation's portal. */
export const acceptInvitationAction = createFormAction(acceptInvitationSchema, async ({ token }) => {
  const user = await requireUser({ returnTo: invitationPath(token) });
  const result = await acceptInvitation(token, user);
  const current = await getCurrentSession();
  if (current) await setActiveOrganization(current.session.id, result.orgType, result.organizationId);
  revalidatePath(result.portalPath, "layout");
  redirect(result.portalPath);
});

export const changeMemberRoleAction = createAction(changeMemberRoleSchema.extend({ orgType: orgTypeField }), async ({ orgType, memberId, roleId }) => {
  const ctx = await requireOrgMember(orgType);
  await changeMemberRole(ctx, memberId, roleId);
  revalidatePath(ORG_TEAM_PATH[orgType]);
  return ok(undefined, "Role updated.");
});

export const setMemberStatusAction = createAction(setMemberStatusSchema.extend({ orgType: orgTypeField }), async ({ orgType, memberId, status }) => {
  const ctx = await requireOrgMember(orgType);
  await setMemberStatus(ctx, memberId, status);
  revalidatePath(ORG_TEAM_PATH[orgType]);
  return ok(undefined, status === "disabled" ? "Member disabled." : "Member re-enabled.");
});

export const updateMemberDetailsAction = createFormAction(memberDetailsSchema.extend({ orgType: orgTypeField }), async ({ orgType, ...input }) => {
  const ctx = await requireOrgMember(orgType);
  await updateMemberDetails(ctx, input);
  revalidatePath(ORG_TEAM_PATH[orgType]);
  return ok(undefined, "Member details saved.");
});

export const removeMemberAction = createAction(withOrgType({ memberId: f.uuid() }), async ({ orgType, memberId }) => {
  const ctx = await requireOrgMember(orgType);
  await removeMember(ctx, memberId);
  revalidatePath(ORG_TEAM_PATH[orgType]);
  return ok(undefined, "Member removed.");
});

export const leaveOrganizationAction = createAction(withOrgType({}), async ({ orgType }) => {
  const ctx = await requireOrgMember(orgType);
  await leaveOrganization(ctx);
  revalidatePath("/", "layout");
  redirect("/account");
});

export const transferOwnershipAction = createAction(transferOwnershipSchema.extend({ orgType: orgTypeField }), async ({ orgType, memberId }) => {
  const ctx = await requireOrgMember(orgType);
  await transferOwnership(ctx, ctx.organization.id, memberId);
  revalidatePath(ORG_TEAM_PATH[orgType]);
  return ok(undefined, "Ownership transferred. You are now an admin.");
});

export const staffSetMemberStatusAction = createAction(setMemberStatusSchema.extend({ organizationId: f.uuid() }), async ({ organizationId, memberId, status }) => {
  const staff = await requireStaff("orgs.manage");
  await setMemberStatus(staff, memberId, status);
  revalidatePath(adminOrganizationPath(organizationId));
  return ok(undefined, status === "disabled" ? "Member disabled." : "Member re-enabled.");
});

export const staffTransferOwnershipAction = createAction(transferOwnershipSchema.extend({ organizationId: f.uuid() }), async ({ organizationId, memberId }) => {
  const staff = await requireStaff("orgs.manage");
  await transferOwnership(staff, organizationId, memberId);
  revalidatePath(adminOrganizationPath(organizationId));
  return ok(undefined, "Owner appointed.");
});

export const createOrgRoleAction = createFormAction(orgRoleSchema.extend({ orgType: orgTypeField }), async ({ orgType, ...input }) => {
  const ctx = await requireOrgMember(orgType);
  const role = await createOrgRole(ctx, ctx.organization.id, input);
  revalidatePath(ORG_TEAM_PATH[orgType]);
  return ok({ id: role.id }, "Role created.");
});

export const updateOrgRoleAction = createFormAction(orgRoleSchema.extend({ orgType: orgTypeField, roleId: f.uuid() }), async ({ orgType, roleId, ...input }) => {
  const ctx = await requireOrgMember(orgType);
  await updateOrgRole(ctx, roleId, input);
  revalidatePath(ORG_TEAM_PATH[orgType]);
  return ok(undefined, "Role updated.");
});

export const deleteOrgRoleAction = createAction(withOrgType({ roleId: f.uuid() }), async ({ orgType, roleId }) => {
  const ctx = await requireOrgMember(orgType);
  await deleteOrgRole(ctx, roleId);
  revalidatePath(ORG_TEAM_PATH[orgType]);
  return ok(undefined, "Role deleted.");
});
