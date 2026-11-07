import "server-only";

import { and, asc, ilike, inArray, isNull, ne, or } from "drizzle-orm";

import type { SelectOption } from "@/components/shared/types";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { maskEmail, maskPhone } from "@/lib/format";

/** Organisation names for the staff inbox rows. */
export async function organizationNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Organisations a staff member can start a conversation with (not deleted), alphabetical. */
export async function organizationOptions(limit = 500): Promise<SelectOption[]> {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, type: organizations.type })
    .from(organizations)
    .where(isNull(organizations.deletedAt))
    .orderBy(asc(organizations.name))
    .limit(limit);
  const TYPE: Record<string, string> = { employer: "Employer", recruitment_partner: "Recruitment partner", institution: "Institution" };
  return rows.map((r) => ({ value: r.id, label: r.name, description: TYPE[r.type] ?? r.type }));
}

/** People search for the staff composer: name, exact-prefix email or phone. Contact details are masked in results. */
export async function searchPeople(query: string, excludeUserId: string): Promise<SelectOption[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const term = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const rows = await db
    .select({ id: users.id, name: users.displayName, email: users.email, phone: users.phone })
    .from(users)
    .where(and(inArray(users.status, ["active", "pending_verification"]), ne(users.id, excludeUserId), or(ilike(users.displayName, term), ilike(users.email, `${q.toLowerCase()}%`), ilike(users.phone, `%${q.replace(/\s/g, "")}%`))))
    .orderBy(asc(users.displayName))
    .limit(15);
  return rows.map((r) => ({ value: r.id, label: r.name, description: r.email ? maskEmail(r.email) : r.phone ? maskPhone(r.phone) : undefined }));
}
