import { NextResponse } from "next/server";

import { absoluteUrl } from "@/lib/env";
import { listInterviewsForCandidate } from "@/modules/recruitment/queries";
import { asCandidate } from "@/modules/recruitment/service";

import { buildInterviewIcs } from "../../_lib/ics";
import { requireOnboardedCandidate } from "../../../_lib/guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Calendar file (.ics) for one of the caller's own interviews. The recruitment module scopes the list
 * to the candidate, so another person's interview id is simply not found. Read-only (GET), no caching.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOnboardedCandidate();
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Not found", { status: 404 });
  const interviews = await listInterviewsForCandidate(asCandidate(session), {});
  const interview = interviews.find((i) => i.id === id);
  if (!interview) return new NextResponse("Not found", { status: 404 });

  const description = [
    `${interview.jobTitle} · ${interview.employerName}`,
    `Reference: ${interview.code}`,
    `Time zone: ${interview.timezone}`,
    interview.meetingUrl ? `Join: ${interview.meetingUrl}` : null,
    interview.candidateInstructions,
  ]
    .filter(Boolean)
    .join("\n");
  const body = buildInterviewIcs({
    id: interview.id,
    code: interview.code,
    title: `${interview.roundName}: ${interview.jobTitle}`,
    start: interview.scheduledStart,
    end: interview.scheduledEnd,
    location: interview.location,
    meetingUrl: interview.meetingUrl,
    description,
    cancelled: interview.status === "cancelled",
    url: absoluteUrl(`/talent/applications/${interview.applicationId}`),
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="interview-${interview.code.replace(/[^A-Za-z0-9-]/g, "")}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
