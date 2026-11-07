"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ROLE_SCOPES } from "@/db/schema/_constants";
import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireStaff } from "@/modules/identity/authz";

import { createRoleTemplate, deleteRoleTemplate, updateRoleTemplate } from "./_lib/roles";

const ROLES_PATH = "/admin/settings/roles";

export const createRoleAction = createFormAction(
  z.object({
    scope: z.enum(ROLE_SCOPES),
    name: f.text({ label: "Role name", max: 80 }),
    description: f.optionalText(300),
    copyFromId: f.optionalUuid(),
  }),
  async (input) => {
    const ctx = await requireStaff("settings.roles");
    const { id } = await createRoleTemplate(ctx, input);
    revalidatePath(ROLES_PATH);
    return ok({ id }, "Role created. Choose its permissions next.");
  },
);

export const updateRoleAction = createFormAction(
  z.object({
    id: f.uuid(),
    name: f.text({ label: "Role name", max: 80 }),
    description: f.optionalText(300),
    permissions: f.stringArray().pipe(z.array(z.string().max(80)).max(200)),
  }),
  async ({ id, ...input }) => {
    const ctx = await requireStaff("settings.roles");
    const { added, removed } = await updateRoleTemplate(ctx, id, input);
    revalidatePath(ROLES_PATH);
    revalidatePath(`${ROLES_PATH}/${id}`);
    const changes = added.length + removed.length;
    return ok(undefined, changes ? `Role saved: ${added.length} permission${added.length === 1 ? "" : "s"} added, ${removed.length} removed` : "Role saved");
  },
);

export const deleteRoleAction = createAction(z.object({ id: z.uuid(), scope: z.enum(ROLE_SCOPES) }), async ({ id, scope }) => {
  const ctx = await requireStaff("settings.roles");
  await deleteRoleTemplate(ctx, id);
  revalidatePath(ROLES_PATH);
  redirect(`${ROLES_PATH}?scope=${scope}`);
});
