"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, ok } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import { CV_SUBMISSIONS_ADMIN_PATH } from "@/modules/operations/cv-submissions";
import { getMatchCriteria, markMatchedCvsContacted, MATCH_LIMIT, revealMatchPhones } from "@/modules/operations/cv-matching";

const targetSchema = z.object({ kind: z.enum(["poster", "requirement"]), id: z.uuid() });
const personSchema = z.object({ kind: z.enum(["cv", "profile"]), id: z.uuid() });

/** Mark the selected matched CVs (still "new") as contacted. candidates.manage, re-checked by the service. */
export const markMatchesContactedAction = createAction(z.object({ target: targetSchema, ids: z.array(z.uuid()).min(1).max(MATCH_LIMIT) }), async (input) => {
  const ctx = await requireStaff("candidates.manage");
  const criteria = await getMatchCriteria(ctx, input.target);
  const updated = await markMatchedCvsContacted(ctx, input.ids);
  if (criteria) revalidatePath(criteria.adminHref);
  revalidatePath(CV_SUBMISSIONS_ADMIN_PATH);
  return ok({ updated }, updated ? `${updated} ${updated === 1 ? "CV" : "CVs"} marked as contacted.` : "The selected CVs were already contacted or further along.");
});

/** Phone numbers of the selected people for "Copy numbers" (candidates.view_contact; one log row per person). */
export const copyMatchNumbersAction = createAction(z.object({ target: targetSchema, people: z.array(personSchema).min(1).max(MATCH_LIMIT * 2) }), async (input) => {
  const ctx = await requireStaff(["candidates.view", "candidates.view_contact"]);
  const criteria = await getMatchCriteria(ctx, input.target);
  const found = await revealMatchPhones(ctx, input.people, { target: input.target, accessType: "export", reason: `Copied numbers for ${criteria?.code ?? criteria?.title ?? "a requirement"}` });
  return ok({ phones: found.map((p) => p.phone) });
});

/** Reveal one matched person's number (candidates.view_contact; logged). */
export const revealMatchPhoneAction = createAction(z.object({ target: targetSchema, person: personSchema }), async (input) => {
  const ctx = await requireStaff(["candidates.view", "candidates.view_contact"]);
  const criteria = await getMatchCriteria(ctx, input.target);
  const [found] = await revealMatchPhones(ctx, [input.person], { target: input.target, accessType: "reveal", reason: `Matched to ${criteria?.code ?? criteria?.title ?? "a requirement"}` });
  return ok({ phone: found?.phone ?? null });
});
