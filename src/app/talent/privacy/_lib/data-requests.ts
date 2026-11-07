import "server-only";

import type { SessionUser } from "@/modules/identity/session";
import { listMyDataRequests as listRequests, type MyDataRequestItem } from "@/modules/privacy/queries";
import { createDataRequest } from "@/modules/privacy/service";

/**
 * Data-subject requests raised from /talent/privacy (DPDP Act 2023 rights: access/export,
 * correction, erasure). Thin adapter over the privacy module, which owns the rules (one open
 * request per type, due date from privacy.data_request_sla_days, rate limit, staff alert, audit).
 * A deletion request always closes the account: the erasure task anonymises it.
 */

export type SelfServiceRequestType = "export" | "correction" | "deletion";
export type MyDataRequest = MyDataRequestItem;

const TALENT_PRIVACY_PATH = "/talent/privacy";

export function listMyDataRequests(userId: string): Promise<MyDataRequest[]> {
  return listRequests(userId);
}

export async function createMyDataRequest(user: SessionUser, input: { type: SelfServiceRequestType; details: string | null }): Promise<{ code: string; dueAt: Date }> {
  const { code, dueAt } = await createDataRequest(
    user,
    { type: input.type, details: input.details ?? undefined, confirmDeletion: input.type === "deletion" },
    { source: "talent_privacy", link: TALENT_PRIVACY_PATH },
  );
  return { code, dueAt };
}
