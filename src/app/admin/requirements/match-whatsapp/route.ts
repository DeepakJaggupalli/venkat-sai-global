import type { NextRequest } from "next/server";
import { z } from "zod";

import { ActionError } from "@/lib/actions";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { matchWhatsappHref, type MatchPersonKind, type MatchTargetKind } from "@/modules/operations/cv-matching";

/**
 * One-tap WhatsApp for a matched person: /admin/requirements/match-whatsapp?target=poster:<id>&person=cv:<id>.
 * Checks candidates.view + candidates.view_contact, logs the number reveal (logDataAccess, access type "share") and
 * redirects to wa.me with a prefilled message. The number never appears in the page HTML. Nothing is sent
 * automatically: staff press send in WhatsApp themselves.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const querySchema = z.object({
  target: z.string().regex(new RegExp(`^(poster|requirement):${UUID}$`)),
  person: z.string().regex(new RegExp(`^(cv|profile):${UUID}$`)),
});

function split<K extends string>(value: string): { kind: K; id: string } {
  const [kind, id] = value.split(":") as [K, string];
  return { kind, id };
}

export async function GET(request: NextRequest): Promise<Response> {
  const ctx = await getStaffContext();
  if (!ctx || !staffCan(ctx, ["candidates.view", "candidates.view_contact"])) return new Response("Forbidden", { status: 403 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  try {
    const href = await matchWhatsappHref(ctx, split<MatchTargetKind>(parsed.data.target), split<MatchPersonKind>(parsed.data.person));
    return new Response(null, { status: 303, headers: { Location: href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    if (error instanceof ActionError) return new Response(error.message, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
