import "server-only";

import { requireOrgMember, requireStaff } from "@/modules/identity/authz";
import { requireUser } from "@/modules/identity/session";

import type { ActorPortal } from "./schemas";
import type { ThreadActor } from "./threads";
import type { NoteActor } from "./work";

/**
 * Resolve the acting capacity for actions shared by several portals (threads, notes). Each guard
 * redirects / 403s on its own (sign-in, onboarding, missing permission).
 */
export async function resolveThreadActor(portal: ActorPortal): Promise<ThreadActor> {
  switch (portal) {
    case "admin":
      return { kind: "staff", ctx: await requireStaff() };
    case "employer":
      return { kind: "org", ctx: await requireOrgMember("employer") };
    case "recruiter":
      return { kind: "org", ctx: await requireOrgMember("recruitment_partner") };
    case "institution":
      return { kind: "org", ctx: await requireOrgMember("institution") };
    case "talent":
      return { kind: "user", user: await requireUser() };
  }
}

export async function resolveNoteActor(portal: Exclude<ActorPortal, "talent">): Promise<NoteActor> {
  const actor = await resolveThreadActor(portal);
  if (actor.kind === "user") throw new Error("unreachable");
  return actor;
}

/** Portal path prefix used for revalidation. */
export const PORTAL_PREFIX: Record<ActorPortal, string> = {
  admin: "/admin",
  employer: "/employer",
  recruiter: "/recruiter",
  institution: "/institution",
  talent: "/talent",
};
