"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ORG_TYPES } from "@/db/schema/_constants";
import { ActionError, createAction, ok } from "@/lib/actions";
import { audit } from "@/modules/audit";
import { PORTAL_BASE_PATH } from "@/modules/identity/authz";
import { getCurrentSession, requireUser, setActiveOrganization } from "@/modules/identity/session";

import { findActiveMembership } from "./shell-data";

const switchOrganizationSchema = z.object({
  orgType: z.enum(ORG_TYPES),
  organizationId: z.uuid(),
});

/**
 * Make another organisation the active one for an org portal in this session.
 * Membership is re-verified on the server (active membership, matching type, organisation not deleted);
 * the client only says which organisation it wants. Returns the portal home to navigate to.
 */
export const switchOrganization = createAction(switchOrganizationSchema, async ({ orgType, organizationId }) => {
  const user = await requireUser();
  const current = await getCurrentSession();
  if (!current || current.user.id !== user.id) {
    throw new ActionError("Your session has ended. Please sign in again.", { code: "unauthenticated" });
  }

  const membership = await findActiveMembership(user.id, orgType, organizationId);
  if (!membership) {
    throw new ActionError("You are not an active member of that organisation.", { code: "forbidden" });
  }

  await setActiveOrganization(current.session.id, orgType, membership.organizationId);
  await audit({
    action: "organization.context_switched",
    entityType: "organization",
    entityId: membership.organizationId,
    organizationId: membership.organizationId,
    metadata: { orgType },
  });

  const href = PORTAL_BASE_PATH[orgType];
  revalidatePath(href, "layout");
  return ok({ href }, `Switched to ${membership.organizationName}`);
});
