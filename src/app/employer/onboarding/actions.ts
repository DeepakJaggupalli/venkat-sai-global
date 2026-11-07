"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ActionError, createFormAction } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { f } from "@/lib/validation";
import { assertPortalEnabled } from "@/components/layout/shell-data";
import { getOrgContext } from "@/modules/identity/authz";
import { getCurrentSession, requireUser, setActiveOrganization } from "@/modules/identity/session";
import { updateMemberDetails } from "@/modules/organizations/members";
import { organizationDetailsSchema } from "@/modules/organizations/schemas";
import { createOrganization } from "@/modules/organizations/service";

const onboardingSchema = organizationDetailsSchema.extend({
  /** The signed-in person's designation; saved on their membership as the authorised representative. */
  representativeTitle: f.text({ max: 120, label: "Your designation" }),
  confirmAuthorised: z.preprocess((v) => v === "true" || v === "on" || v === true, z.literal(true, { error: "Confirm that you are authorised to register this company" })),
});

/**
 * Create the employer organisation owned by the signed-in user (status draft), make it the active
 * employer workspace and open the dashboard, where the setup checklist continues.
 */
export const createEmployerOrganizationAction = createFormAction(onboardingSchema, async (input) => {
  const user = await requireUser({ returnTo: "/employer/onboarding" });
  await assertPortalEnabled("employer");
  const limited = await rateLimit(`org-create:${user.id}`, 5, 24 * 60 * 60);
  if (!limited.allowed) throw new ActionError("You have created several organisations today. Contact Venkat Sai support if you need more.");

  const { representativeTitle, confirmAuthorised: _confirmed, ...details } = input;
  void _confirmed;
  const org = await createOrganization("employer", details, user);
  const current = await getCurrentSession();
  if (current) await setActiveOrganization(current.session.id, "employer", org.id);

  try {
    const ctx = await getOrgContext("employer");
    if (ctx && ctx.organization.id === org.id) {
      await updateMemberDetails(ctx, { memberId: ctx.membership.id, jobTitle: representativeTitle });
    }
  } catch (error) {
    // The workspace exists; the designation can be added later from the team page.
    logger.warn("Could not save the representative designation", { error, organizationId: org.id });
  }

  revalidatePath("/employer", "layout");
  redirect("/employer?welcome=1");
});
