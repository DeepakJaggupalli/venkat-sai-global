import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import type { SelectOption } from "@/components/shared/types";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import type { OrgContext } from "@/modules/identity/authz";

/** The organisation's jobs as options for linking a talent list (local helper; scoped to the organisation). */
export async function orgJobOptions(ctx: OrgContext<"employer">): Promise<SelectOption[]> {
  const rows = await db
    .select({ id: jobs.id, title: jobs.title, code: jobs.code })
    .from(jobs)
    .where(and(eq(jobs.organizationId, ctx.organization.id), isNull(jobs.deletedAt)))
    .orderBy(desc(jobs.updatedAt))
    .limit(200);
  return rows.map((j) => ({ value: j.id, label: j.title, description: j.code }));
}
