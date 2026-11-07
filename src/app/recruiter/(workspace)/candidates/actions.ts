"use server";

import { z } from "zod";

import { ActionError, createAction, ok } from "@/lib/actions";
import { logDataAccess } from "@/modules/audit";
import { requireOrgMember } from "@/modules/identity/authz";

import { getSourcedCandidateContact } from "../_lib/queries";

/**
 * Reveal the email or phone of a candidate the partner itself sourced (never anyone else's).
 * Every reveal is written to the data-access log.
 */
export const revealSourcedContactAction = createAction(z.object({ candidateId: z.uuid(), field: z.enum(["email", "phone"]) }), async ({ candidateId, field }) => {
  const ctx = await requireOrgMember("recruitment_partner", "partner.candidates.submit");
  const contact = await getSourcedCandidateContact(ctx, candidateId);
  const value = contact?.[field];
  if (!contact || !value) throw new ActionError("This contact detail is not available to you.", { code: "not_found" });
  await logDataAccess({
    actorUserId: ctx.user.id,
    actorOrganizationId: ctx.organization.id,
    subjectType: "candidate",
    subjectId: candidateId,
    subjectUserId: contact.userId,
    dataCategory: "contact",
    accessType: "reveal",
    reason: "Recruitment partner viewed the contact details of a candidate it sourced",
    metadata: { field },
  });
  return ok({ value });
});
