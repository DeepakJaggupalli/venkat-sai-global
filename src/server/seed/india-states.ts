import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { states } from "@/db/schema";

import { assertUnique, countInserted, type SeedResult } from "./util";

/**
 * India's 28 states and 8 union territories (current names), with ISO 3166-2:IN subdivision
 * codes (without the "IN-" prefix).
 */
export const INDIA_STATES: readonly { code: string; name: string; kind: "state" | "union_territory" }[] = [
  { code: "AP", name: "Andhra Pradesh", kind: "state" },
  { code: "AR", name: "Arunachal Pradesh", kind: "state" },
  { code: "AS", name: "Assam", kind: "state" },
  { code: "BR", name: "Bihar", kind: "state" },
  { code: "CG", name: "Chhattisgarh", kind: "state" },
  { code: "GA", name: "Goa", kind: "state" },
  { code: "GJ", name: "Gujarat", kind: "state" },
  { code: "HR", name: "Haryana", kind: "state" },
  { code: "HP", name: "Himachal Pradesh", kind: "state" },
  { code: "JH", name: "Jharkhand", kind: "state" },
  { code: "KA", name: "Karnataka", kind: "state" },
  { code: "KL", name: "Kerala", kind: "state" },
  { code: "MP", name: "Madhya Pradesh", kind: "state" },
  { code: "MH", name: "Maharashtra", kind: "state" },
  { code: "MN", name: "Manipur", kind: "state" },
  { code: "ML", name: "Meghalaya", kind: "state" },
  { code: "MZ", name: "Mizoram", kind: "state" },
  { code: "NL", name: "Nagaland", kind: "state" },
  { code: "OD", name: "Odisha", kind: "state" },
  { code: "PB", name: "Punjab", kind: "state" },
  { code: "RJ", name: "Rajasthan", kind: "state" },
  { code: "SK", name: "Sikkim", kind: "state" },
  { code: "TN", name: "Tamil Nadu", kind: "state" },
  { code: "TS", name: "Telangana", kind: "state" },
  { code: "TR", name: "Tripura", kind: "state" },
  { code: "UP", name: "Uttar Pradesh", kind: "state" },
  { code: "UK", name: "Uttarakhand", kind: "state" },
  { code: "WB", name: "West Bengal", kind: "state" },
  { code: "AN", name: "Andaman and Nicobar Islands", kind: "union_territory" },
  { code: "CH", name: "Chandigarh", kind: "union_territory" },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu", kind: "union_territory" },
  { code: "DL", name: "Delhi", kind: "union_territory" },
  { code: "JK", name: "Jammu and Kashmir", kind: "union_territory" },
  { code: "LA", name: "Ladakh", kind: "union_territory" },
  { code: "LD", name: "Lakshadweep", kind: "union_territory" },
  { code: "PY", name: "Puducherry", kind: "union_territory" },
];

export async function seedIndiaStates(): Promise<SeedResult> {
  assertUnique(INDIA_STATES, (s) => s.code, "Indian state code");
  assertUnique(INDIA_STATES, (s) => s.name, "Indian state name");
  const rows = await db
    .insert(states)
    .values(INDIA_STATES.map((s) => ({ countryCode: "IN", code: s.code, name: s.name, isActive: true })))
    .onConflictDoUpdate({
      target: [states.countryCode, states.name],
      set: { code: sql`excluded.code` },
      setWhere: sql`${states.code} is null`,
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return { name: "states (India)", ...countInserted(rows), total: INDIA_STATES.length };
}
