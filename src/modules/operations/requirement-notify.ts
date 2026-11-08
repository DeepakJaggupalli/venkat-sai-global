import "server-only";

import type { DbOrTx } from "@/db";
import { requirementRequests } from "@/db/schema";
import { notify, notifyOrganization, notifyStaff } from "@/modules/notifications";

import { notifyBusinessInbox } from "./business-inbox";
import { REQUIREMENT_SOURCE_LABELS, REQUIREMENT_STATUS_LABELS } from "./constants";
import { employerRequirementHref, staffRequirementHref } from "./links";

/**
 * Requirement notifications shared by the requirement services and the approval handler (kept free of
 * the approvals service so approval-handlers.ts never forms an import cycle with it).
 */

export type RequirementRow = typeof requirementRequests.$inferSelect;

/** Employer side of a requirement: organisation members who manage requirements, or the public contact. */
export async function notifyRequirementSubmitter(
  requirement: RequirementRow,
  input: { event: "requirement.received" | "requirement.status_changed"; data?: Record<string, unknown> },
  tx: DbOrTx,
): Promise<void> {
  const data = {
    forStaff: false,
    code: requirement.code,
    title: requirement.title,
    status: REQUIREMENT_STATUS_LABELS[requirement.status],
    ...input.data,
  };
  if (requirement.organizationId) {
    await notifyOrganization(
      {
        event: input.event,
        organizationId: requirement.organizationId,
        permission: "employer.requirements.manage",
        data,
        link: employerRequirementHref(requirement.id),
      },
      { tx },
    );
    return;
  }
  const recipient = requirement.contactEmail
    ? { email: requirement.contactEmail, name: requirement.contactName }
    : requirement.contactPhone
      ? { phone: requirement.contactPhone }
      : null;
  if (!recipient) return;
  await notify({ event: input.event, recipients: [recipient], data, channels: "phone" in recipient ? ["sms"] : ["email"] }, { tx });
}

/** Staff side: the owner when assigned, else everyone with requirements.view. */
export async function notifyRequirementStaff(
  requirement: RequirementRow,
  input: { event: "requirement.received" | "requirement.status_changed"; data?: Record<string, unknown> },
  tx: DbOrTx,
): Promise<void> {
  const data = {
    forStaff: true,
    code: requirement.code,
    title: requirement.title,
    organizationName: requirement.organizationName,
    totalPositions: requirement.totalPositions,
    status: REQUIREMENT_STATUS_LABELS[requirement.status],
    source: requirement.source,
    sourceLabel: REQUIREMENT_SOURCE_LABELS[requirement.source],
    ...input.data,
  };
  if (input.event === "requirement.received") await notifyBusinessInbox({ event: input.event, data, link: staffRequirementHref(requirement.id) }, tx);
  if (requirement.assignedToUserId) {
    await notify({ event: input.event, recipients: [{ userId: requirement.assignedToUserId }], data, link: staffRequirementHref(requirement.id) }, { tx });
    return;
  }
  await notifyStaff({ event: input.event, permission: "requirements.view", data, link: staffRequirementHref(requirement.id) }, { tx });
}
