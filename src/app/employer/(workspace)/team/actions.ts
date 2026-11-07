"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { rateLimit } from "@/lib/rate-limit";
import { ActionError } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireOrgMember } from "@/modules/identity/authz";
import {
  changeMemberRole,
  createOrgRole,
  deleteOrgRole,
  inviteMember,
  removeMember,
  resendInvitation,
  revokeInvitation,
  setMemberStatus,
  transferOwnership,
  updateMemberDetails,
  updateOrgRole,
} from "@/modules/organizations/members";
import { changeMemberRoleSchema, inviteMemberSchema, memberDetailsSchema, orgRoleSchema, setMemberStatusSchema } from "@/modules/organizations/schemas";

/**
 * Team management for the active employer organisation. Every action re-authorises with
 * employer.team.manage; the organisations module enforces escalation guards, seat limits and
 * last-owner protection.
 */
const guard = () => requireOrgMember("employer", "employer.team.manage");
const refresh = () => revalidatePath("/employer/team");

export const inviteTeamMemberAction = createFormAction(inviteMemberSchema, async (input) => {
  const ctx = await guard();
  const limited = await rateLimit(`org-invite:${ctx.organization.id}:${ctx.user.id}`, 30, 60 * 60);
  if (!limited.allowed) throw new ActionError("You have sent many invitations in the last hour. Try again later.");
  const result = await inviteMember(ctx, ctx.organization.id, input);
  refresh();
  return ok({ email: result.email }, `Invitation sent to ${result.email}.`);
});

export const resendTeamInvitationAction = createAction(z.object({ invitationId: z.uuid() }), async ({ invitationId }) => {
  const ctx = await guard();
  await resendInvitation(ctx, invitationId);
  refresh();
  return ok(undefined, "Invitation sent again with a new link.");
});

export const revokeTeamInvitationAction = createAction(z.object({ invitationId: z.uuid() }), async ({ invitationId }) => {
  const ctx = await guard();
  await revokeInvitation(ctx, invitationId);
  refresh();
  return ok(undefined, "Invitation cancelled.");
});

export const changeTeamMemberRoleAction = createFormAction(changeMemberRoleSchema, async ({ memberId, roleId }) => {
  const ctx = await guard();
  await changeMemberRole(ctx, memberId, roleId);
  refresh();
  return ok(undefined, "Role changed.");
});

export const setTeamMemberStatusAction = createAction(setMemberStatusSchema, async ({ memberId, status }) => {
  const ctx = await guard();
  await setMemberStatus(ctx, memberId, status);
  refresh();
  return ok(undefined, status === "disabled" ? "Member disabled. They can no longer open this workspace." : "Member re-enabled.");
});

export const updateTeamMemberDetailsAction = createFormAction(memberDetailsSchema, async (input) => {
  const ctx = await guard();
  await updateMemberDetails(ctx, input);
  refresh();
  return ok(undefined, "Member details saved.");
});

export const removeTeamMemberAction = createAction(z.object({ memberId: z.uuid() }), async ({ memberId }) => {
  const ctx = await guard();
  await removeMember(ctx, memberId);
  refresh();
  return ok(undefined, "Member removed from the workspace.");
});

export const transferTeamOwnershipAction = createAction(z.object({ memberId: z.uuid() }), async ({ memberId }) => {
  const ctx = await guard();
  await transferOwnership(ctx, ctx.organization.id, memberId);
  revalidatePath("/employer", "layout");
  return ok(undefined, "Ownership transferred. You are now an admin.");
});

export const saveTeamRoleAction = createFormAction(orgRoleSchema.extend({ roleId: f.optionalUuid() }), async ({ roleId, ...input }) => {
  const ctx = await guard();
  if (roleId) {
    await updateOrgRole(ctx, roleId, input);
  } else {
    await createOrgRole(ctx, ctx.organization.id, input);
  }
  refresh();
  return ok(undefined, roleId ? "Role saved." : "Custom role created.");
});

export const deleteTeamRoleAction = createAction(z.object({ roleId: z.uuid() }), async ({ roleId }) => {
  const ctx = await guard();
  await deleteOrgRole(ctx, roleId);
  refresh();
  return ok(undefined, "Role deleted.");
});
