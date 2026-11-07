"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { f } from "@/lib/validation";
import { requireStaff } from "@/modules/identity/authz";
import { verifyPartnerLicence } from "@/modules/organizations/partner";
import { reviewOrganizationDocumentSchema, verifyLicenceSchema } from "@/modules/organizations/schemas";
import { reviewOrganizationDocument, setAccountManager } from "@/modules/organizations/service";

/**
 * Form wrappers (the module ships these as programmatic actions) so reviewers can add notes inline.
 * Same permissions as the module actions; the services re-check them.
 */

export const reviewDocumentFormAction = createFormAction(reviewOrganizationDocumentSchema, async (input) => {
  const staff = await requireStaff("orgs.verify");
  await reviewOrganizationDocument(staff, input);
  revalidatePath("/admin/organizations", "layout");
  return ok(undefined, input.reviewStatus === "accepted" ? "Document accepted" : "Document rejected");
});

export const verifyLicenceFormAction = createFormAction(verifyLicenceSchema, async (input) => {
  const staff = await requireStaff("orgs.verify");
  await verifyPartnerLicence(staff, input);
  revalidatePath("/admin/organizations", "layout");
  return ok(undefined, "Licence verified");
});

/** Account manager picker adapter ({ id, assigneeUserId } like every other assignment control). */
export const assignAccountManagerAction = createAction(z.object({ id: f.uuid(), assigneeUserId: f.uuid().nullable() }), async ({ id, assigneeUserId }) => {
  const staff = await requireStaff("orgs.manage");
  await setAccountManager(staff, id, assigneeUserId);
  revalidatePath(`/admin/organizations/${id}`);
  revalidatePath("/admin/organizations");
  return ok(undefined, assigneeUserId ? "Account manager assigned" : "Account manager removed");
});
