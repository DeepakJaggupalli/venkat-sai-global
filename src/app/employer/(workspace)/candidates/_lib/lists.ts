import "server-only";

import type { ListChoice } from "@/components/employer-talent/add-to-list-dialog";
import type { OrgContext } from "@/modules/identity/authz";
import { orgCan } from "@/modules/identity/authz";
import { asEmployer } from "@/modules/recruitment/actors";
import { listTalentLists } from "@/modules/recruitment/queries";

/** Active talent lists the member may add to (empty without the lists permission). */
export async function loadListChoices(ctx: OrgContext<"employer">): Promise<{ canUseLists: boolean; lists: ListChoice[] }> {
  if (!orgCan(ctx, "employer.candidates.lists")) return { canUseLists: false, lists: [] };
  const lists = await listTalentLists(asEmployer(ctx), { includeArchived: false });
  return { canUseLists: true, lists: lists.map((l) => ({ id: l.id, name: l.name, itemCount: l.itemCount })) };
}
