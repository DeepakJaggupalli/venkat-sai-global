/**
 * Who may read and post in a message thread (pure, client-safe; unit-tested in thread-access.test.ts).
 *
 *  - Staff: explicit participants, or staff holding the permission of the thread's context
 *    (requirement → requirements.view, partner work → partners.view, applications / placements →
 *    recruitment.view, organisation / general → orgs.view). Posting needs the same; it adds them as a participant.
 *  - Organisation members: only threads of an organisation they actively belong to (thread.organizationId),
 *    with the portal's messaging permission where one exists (partners: partner.messages). Partners and
 *    employers never see another organisation's threads, even as a stale participant.
 *  - Anyone else (candidates): only threads where they are an active participant.
 *  Closed threads are read-only for everyone except staff, who may reopen them.
 */
import type { PlatformPermission } from "@/config/permissions";
import type { OrgType } from "@/db/schema/_constants";
import type { MessageThreadContextType, MessageThreadStatus } from "@/db/schema/operations";

export const THREAD_CONTEXT_STAFF_PERMISSION: Record<MessageThreadContextType, PlatformPermission> = {
  general: "orgs.view",
  requirement: "requirements.view",
  partner_assignment: "partners.view",
  partner_submission: "partners.view",
  application: "recruitment.view",
  placement: "recruitment.view",
  organization: "orgs.view",
};

/** Permission an organisation member needs to use threads, per organisation type (null = any active member). */
export const ORG_THREAD_PERMISSION: Record<OrgType, string | null> = {
  employer: null,
  recruitment_partner: "partner.messages",
  institution: null,
};

export type ThreadViewer =
  | { kind: "staff"; userId: string; permissions: ReadonlySet<string> }
  | { kind: "member"; userId: string; memberships: ReadonlyArray<{ organizationId: string; organizationType: OrgType; permissions: ReadonlySet<string> }> }
  | { kind: "user"; userId: string };

export type ThreadFacts = {
  organizationId: string | null;
  contextType: MessageThreadContextType;
  status: MessageThreadStatus;
};

export type ParticipantFacts = { userId: string; organizationId: string | null; removedAt: Date | null } | null | undefined;

export type ThreadAccess = { canRead: boolean; canPost: boolean; via: "participant" | "organization" | "staff" | null };

const NONE: ThreadAccess = { canRead: false, canPost: false, via: null };

export function threadAccess(viewer: ThreadViewer, thread: ThreadFacts, participant: ParticipantFacts): ThreadAccess {
  const activeParticipant = Boolean(participant && participant.userId === viewer.userId && !participant.removedAt);
  const open = thread.status === "open";

  if (viewer.kind === "staff") {
    if (activeParticipant) return { canRead: true, canPost: open, via: "participant" };
    if (viewer.permissions.has(THREAD_CONTEXT_STAFF_PERMISSION[thread.contextType])) return { canRead: true, canPost: open, via: "staff" };
    return NONE;
  }

  if (viewer.kind === "member") {
    if (thread.organizationId) {
      const membership = viewer.memberships.find((m) => m.organizationId === thread.organizationId);
      if (membership) {
        const needed = ORG_THREAD_PERMISSION[membership.organizationType];
        if (!needed || membership.permissions.has(needed)) {
          return { canRead: true, canPost: open, via: activeParticipant ? "participant" : "organization" };
        }
        return NONE;
      }
      // A participant row tied to an organisation the viewer no longer belongs to grants nothing.
      if (participant?.organizationId) return NONE;
    }
    return activeParticipant && !participant?.organizationId ? { canRead: true, canPost: open, via: "participant" } : NONE;
  }

  return activeParticipant && !participant?.organizationId ? { canRead: true, canPost: open, via: "participant" } : NONE;
}
