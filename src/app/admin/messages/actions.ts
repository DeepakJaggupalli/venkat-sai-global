"use server";

import { z } from "zod";

import type { SelectOption } from "@/components/shared/types";
import { requireStaff } from "@/modules/identity/authz";

import { searchPeople } from "./_lib/queries";

const querySchema = z.string().trim().min(3).max(120);

/** Staff-only people search for starting a conversation (names + masked contacts). */
export async function searchPeopleAction(query: string): Promise<SelectOption[]> {
  const ctx = await requireStaff(["orgs.view", "candidates.view"], "any");
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return [];
  return searchPeople(parsed.data, ctx.user.id);
}
