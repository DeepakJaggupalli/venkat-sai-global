"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAction, ok } from "@/lib/actions";
import { requireCandidate } from "@/modules/candidates/guard";
import { clearUnavailableSavedJobs } from "@/modules/jobs/saved-alerts-service";

/** Remove saved jobs that closed or were withdrawn (the caller's own list only). */
export const clearUnavailableSavedAction = createAction(z.object({}), async () => {
  const { user } = await requireCandidate();
  const removed = await clearUnavailableSavedJobs(user);
  revalidatePath("/talent/saved");
  revalidatePath("/talent");
  return ok({ removed });
});
