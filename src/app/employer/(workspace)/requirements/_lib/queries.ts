import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import type { OrgContext } from "@/modules/identity/authz";

/**
 * The organisation's Venkat Sai account manager (name only, no contact details), shown as the Venkat Sai
 * contact on requirements. The operations module deliberately hides the internal requirement owner from
 * employers, so the organisation-level account manager is used instead (see report: cross-module needs).
 */
export async function getAccountManagerName(ctx: OrgContext<"employer">): Promise<string | null> {
  const id = ctx.organization.accountManagerUserId;
  if (!id) return null;
  const [row] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, id)).limit(1);
  return row?.name ?? null;
}
