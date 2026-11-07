import { NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import { requireCandidate } from "@/modules/candidates/guard";
import { buildCandidateDataExport } from "@/modules/candidates/export";

import { getAgeGateForCandidate } from "../../onboarding/_lib/state";

/**
 * Immediate copy of the candidate's own profile data as JSON (DPDP right of access). Built by the
 * candidates module (which audits it). Applications, interviews and uploaded files come with a full
 * export request handled by the Venkat Sai team. Read-only GET, never cached.
 */
export async function GET() {
  const session = await requireCandidate();
  const gate = await getAgeGateForCandidate(session.candidate);
  if (gate.state !== "complete") return new NextResponse(null, { status: 303, headers: { Location: "/talent/onboarding" } });
  const limit = await rateLimit(`talent-data-download:${session.user.id}`, 5, 3600);
  if (!limit.allowed) return new NextResponse("Too many downloads. Please try again later.", { status: 429, headers: { "Retry-After": "3600" } });

  const data = await buildCandidateDataExport({ kind: "self", session });
  const filename = `venkat-sai-global-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
