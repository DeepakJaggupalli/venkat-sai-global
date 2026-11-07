/**
 * Support SLA rules (pure, client-safe; unit-tested in sla.test.ts).
 *
 *  - First response: `support.sla_hours_<priority>` hours after creation.
 *  - Grievances (IT Rules 2021 as amended): acknowledge within `privacy.grievance_ack_hours` (or the priority
 *    SLA when shorter) and resolve within `privacy.grievance_resolution_days`, or the shorter statutory
 *    timeline of the grievance type (content removal 72 hours, impersonation / intimate content 24 hours).
 *  - Regular tickets have no resolution deadline unless staff set one (no setting exists for it).
 */
import type { GrievanceType, SupportTicketPriority, SupportTicketStatus } from "@/db/schema/operations";

export type SlaSettings = {
  /** First-response hours per priority (support.sla_hours_*). */
  firstResponseHours: Record<SupportTicketPriority, number>;
  /** privacy.grievance_ack_hours */
  grievanceAckHours: number;
  /** privacy.grievance_resolution_days */
  grievanceResolutionDays: number;
};

/** Statutory maximum resolution times (hours) that override the configured grievance resolution days. */
export const STATUTORY_GRIEVANCE_RESOLUTION_HOURS: Partial<Record<GrievanceType, number>> = {
  content_removal: 72,
  impersonation_or_intimate_content: 24,
};

const HOUR = 60 * 60 * 1000;

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function computeTicketSla(
  ticket: { createdAt: Date; priority: SupportTicketPriority; isGrievance: boolean; grievanceType?: GrievanceType | null },
  settings: SlaSettings,
): { firstResponseDueAt: Date; resolutionDueAt: Date | null } {
  const created = ticket.createdAt.getTime();
  const priorityHours = positive(settings.firstResponseHours[ticket.priority], 24);
  if (!ticket.isGrievance) {
    return { firstResponseDueAt: new Date(created + priorityHours * HOUR), resolutionDueAt: null };
  }
  const ackHours = Math.min(positive(settings.grievanceAckHours, 24), priorityHours);
  const configuredResolutionHours = positive(settings.grievanceResolutionDays, 15) * 24;
  const statutory = ticket.grievanceType ? STATUTORY_GRIEVANCE_RESOLUTION_HOURS[ticket.grievanceType] : undefined;
  const resolutionHours = statutory ? Math.min(statutory, configuredResolutionHours) : configuredResolutionHours;
  return {
    firstResponseDueAt: new Date(created + Math.min(ackHours, resolutionHours) * HOUR),
    resolutionDueAt: new Date(created + resolutionHours * HOUR),
  };
}

export type DeadlineState = "none" | "met" | "pending" | "due_soon" | "breached";

export type SlaSnapshot = {
  firstResponse: DeadlineState;
  resolution: DeadlineState;
  /** Any deadline missed (open or met late). */
  breached: boolean;
};

const CLOSED: readonly SupportTicketStatus[] = ["resolved", "closed"];

function deadlineState(due: Date | null, doneAt: Date | null, open: boolean, now: Date, warnMs: number): DeadlineState {
  if (!due) return "none";
  if (doneAt) return doneAt.getTime() <= due.getTime() ? "met" : "breached";
  if (!open) return "none";
  const left = due.getTime() - now.getTime();
  if (left < 0) return "breached";
  return left <= warnMs ? "due_soon" : "pending";
}

/**
 * Where a ticket stands against its deadlines. `warnBeforeMs` = how close a deadline must be to count as
 * "due soon" (default: 2 hours).
 */
export function evaluateSla(
  ticket: {
    status: SupportTicketStatus;
    firstResponseDueAt: Date | null;
    firstRespondedAt: Date | null;
    resolutionDueAt: Date | null;
    resolvedAt: Date | null;
  },
  now: Date = new Date(),
  warnBeforeMs = 2 * HOUR,
): SlaSnapshot {
  const open = !CLOSED.includes(ticket.status);
  const firstResponse = deadlineState(ticket.firstResponseDueAt, ticket.firstRespondedAt, open, now, warnBeforeMs);
  const resolution = deadlineState(ticket.resolutionDueAt, ticket.resolvedAt, open, now, warnBeforeMs);
  return { firstResponse, resolution, breached: firstResponse === "breached" || resolution === "breached" };
}

/** Escalation level implied by missed deadlines: 1 = first response missed, 2 = resolution missed. Never lowers. */
export function escalationLevelFor(current: number, missed: { firstResponse: boolean; resolution: boolean }): number {
  return Math.max(current, missed.firstResponse ? 1 : 0, missed.resolution ? 2 : 0);
}
