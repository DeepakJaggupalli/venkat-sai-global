/**
 * Actor constructors and accessors (pure). Services take a RecruitmentActor so that one function
 * can serve the Command Centre, the Employer Portal, the Partner Portal and the People Portal while
 * applying the right authorization and scoping for each.
 */
import type { ApplicationActorType } from "@/db/schema/recruitment";
import type { OrgContext, StaffContext } from "@/modules/identity/authz";

import type { CandidateActor, EmployerActor, PartnerActor, RecruitmentActor, StaffActor, SystemActor } from "./types";

export const asStaff = (ctx: StaffContext): StaffActor => ({ kind: "staff", ctx });
export const asEmployer = (ctx: OrgContext<"employer">): EmployerActor => ({ kind: "employer", ctx });
export const asPartner = (ctx: OrgContext<"recruitment_partner">): PartnerActor => ({ kind: "partner", ctx });

/** Accepts the `{ user, candidate }` pair returned by requireCandidate() (candidates module). */
export const asCandidate = (input: { user: { id: string }; candidate: { id: string } }): CandidateActor => ({
  kind: "candidate",
  userId: input.user.id,
  candidateId: input.candidate.id,
});

export const systemActor = (userId: string | null = null): SystemActor => ({ kind: "system", userId });

/** The user performing the action (null for anonymous system work). */
export function actorUserId(actor: RecruitmentActor): string | null {
  switch (actor.kind) {
    case "staff":
    case "employer":
    case "partner":
      return actor.ctx.user.id;
    case "candidate":
    case "system":
      return actor.userId;
  }
}

/** Value stored in application_stage_history.changedByType. */
export function actorType(actor: RecruitmentActor): ApplicationActorType {
  return actor.kind;
}

/** Organisation the actor acts for (employer / partner), else null. */
export function actorOrganizationId(actor: RecruitmentActor): string | null {
  return actor.kind === "employer" || actor.kind === "partner" ? actor.ctx.organization.id : null;
}

/** audit() actor type for the actor. */
export function auditActorType(actor: RecruitmentActor): "user" | "staff" | "system" {
  return actor.kind === "staff" ? "staff" : actor.kind === "system" ? "system" : "user";
}
