"use server";

import { listStaffOptions } from "@/components/admin/queries";
import type { ActionResult, ActionState } from "@/lib/actions";
import { requireStaff } from "@/modules/identity/authz";
import { cancelInterviewAction, completeInterviewAction, rescheduleInterviewAction, scheduleInterviewAction, submitInterviewFeedbackAction } from "@/modules/recruitment/actions";

import { formNumber, formText } from "../pipeline/_shared/form-data";
import { staffTimeZone } from "../pipeline/_shared/server";

/**
 * Interview form adapters for the Command Centre (scheduling on behalf of employers). The recruitment
 * module's actions re-authorise, validate times (stored as UTC + the IANA zone) and notify the
 * candidate and panel.
 */

type ScheduleInput = Parameters<typeof scheduleInterviewAction>[0];

export async function scheduleInterviewFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  const staff = await requireStaff("recruitment.manage");
  const participants: NonNullable<ScheduleInput["participants"]> = [];
  const coordinatorUserId = formText(fd, "coordinatorUserId");
  if (coordinatorUserId) {
    const options = await listStaffOptions();
    const match = options.find((o) => o.value === coordinatorUserId);
    if (match) participants.push({ userId: coordinatorUserId, name: match.label, role: "coordinator" });
  }
  const interviewerName = formText(fd, "interviewerName");
  if (interviewerName) participants.push({ name: interviewerName, email: formText(fd, "interviewerEmail") ?? null, role: "interviewer" });
  const result = await scheduleInterviewAction({
    portal: "admin",
    applicationId: formText(fd, "applicationId") ?? "",
    roundName: formText(fd, "roundName") ?? "",
    roundNumber: formNumber(fd, "roundNumber"),
    mode: (formText(fd, "mode") ?? "") as ScheduleInput["mode"],
    startsAtLocal: (formText(fd, "startsAtLocal") ?? "").slice(0, 16),
    timezone: formText(fd, "timezone") ?? formText(fd, "browserTimeZone") ?? staffTimeZone(staff),
    durationMinutes: formNumber(fd, "durationMinutes") ?? 60,
    location: formText(fd, "location"),
    meetingUrl: formText(fd, "meetingUrl") ?? null,
    candidateInstructions: formText(fd, "candidateInstructions"),
    participants,
    conductedBy: (formText(fd, "conductedBy") as ScheduleInput["conductedBy"]) ?? undefined,
  });
  return result;
}

export async function rescheduleInterviewFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  const staff = await requireStaff("recruitment.manage");
  return rescheduleInterviewAction({
    portal: "admin",
    interviewId: formText(fd, "interviewId") ?? "",
    startsAtLocal: (formText(fd, "startsAtLocal") ?? "").slice(0, 16),
    timezone: formText(fd, "timezone") ?? staffTimeZone(staff),
    durationMinutes: formNumber(fd, "durationMinutes") ?? 60,
    location: formText(fd, "location"),
    meetingUrl: formText(fd, "meetingUrl") ?? null,
    candidateInstructions: formText(fd, "candidateInstructions"),
    reason: formText(fd, "reason"),
  });
}

export async function cancelInterviewFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  await requireStaff("recruitment.manage");
  return cancelInterviewAction({ portal: "admin", interviewId: formText(fd, "interviewId") ?? "", reason: formText(fd, "reason") ?? "" });
}

export async function completeInterviewFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  await requireStaff("recruitment.manage");
  return completeInterviewAction({
    portal: "admin",
    interviewId: formText(fd, "interviewId") ?? "",
    status: formText(fd, "status") === "no_show" ? "no_show" : "completed",
    outcome: (formText(fd, "outcome") ?? "pending") as Parameters<typeof completeInterviewAction>[0]["outcome"],
  });
}

export async function interviewFeedbackFormAction(_prev: ActionState<unknown>, fd: FormData): Promise<ActionResult<unknown>> {
  await requireStaff(["recruitment.manage", "recruitment.view"], "any");
  const rating = formNumber(fd, "rating");
  return submitInterviewFeedbackAction({
    portal: "admin",
    interviewId: formText(fd, "interviewId") ?? "",
    rating: rating ? Math.round(rating) : null,
    recommendation: (formText(fd, "recommendation") ?? "") as Parameters<typeof submitInterviewFeedbackAction>[0]["recommendation"],
    strengths: formText(fd, "strengths"),
    concerns: formText(fd, "concerns"),
    notes: formText(fd, "notes"),
  });
}
