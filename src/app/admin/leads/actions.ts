"use server";

import { revalidatePath } from "next/cache";

import { createFormAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import { leadConvertSchema } from "@/modules/operations/schemas";
import { convertLead } from "@/modules/operations/service";

/** Form wrapper around the module's convertLead (the module ships it as a programmatic action only). */
export const convertLeadFormAction = createFormAction(leadConvertSchema, async ({ id, organizationId }) => {
  const ctx = await requireStaff(["leads.manage", "orgs.view"]);
  await convertLead(ctx, id, organizationId);
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${id}`);
  return ok(undefined, "Lead converted and linked to the organisation");
});
