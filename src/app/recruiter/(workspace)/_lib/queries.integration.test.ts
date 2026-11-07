import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { OrgContext } from "@/modules/identity/authz";

import { getSourcedCandidateContact, listPartnerCandidates, listPartnerMobilisations, listSubmittableCandidates } from "./queries";

/**
 * Smoke test of the Partner Portal read models against an isolated database (SQL validity and
 * scoping to an organisation with no data). Run with
 *   node scripts/test-db.mjs vsg_test_ui_recruiter
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_ui_recruiter'; npx vitest run "src/app/recruiter"
 */
const enabled = Boolean(process.env.DATABASE_URL?.includes("vsg_test_"));

function partnerCtx(permissions: string[]): OrgContext<"recruitment_partner"> {
  return {
    orgType: "recruitment_partner",
    user: { id: randomUUID() } as OrgContext["user"],
    sessionId: randomUUID(),
    organization: { id: randomUUID(), status: "verified" } as OrgContext["organization"],
    membership: { id: randomUUID(), status: "active", jobTitle: null, department: null },
    role: { id: randomUUID(), key: "owner", name: "Owner" },
    permissions: new Set(permissions),
    isOwner: true,
  };
}

describe.skipIf(!enabled)("partner portal queries", () => {
  const ctx = partnerCtx(["partner.candidates.submit", "partner.documents.manage", "partner.submissions.view"]);

  it("lists an empty candidate pool for an organisation without candidates", async () => {
    const page = { page: 1, pageSize: 10, offset: 0 };
    for (const show of [undefined, "attributed", "sourced"] as const) {
      const result = await listPartnerCandidates(ctx, { q: "ra", show }, page);
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    }
  });

  it("returns no submittable candidates, contacts or mobilisations outside the organisation", async () => {
    expect(await listSubmittableCandidates(ctx, randomUUID())).toEqual([]);
    expect(await getSourcedCandidateContact(ctx, randomUUID())).toBeNull();
    expect(await getSourcedCandidateContact(ctx, "not-a-uuid")).toBeNull();
    expect(await listPartnerMobilisations(ctx, { openOnly: true })).toEqual([]);
  });

  it("refuses callers without the permission", async () => {
    await expect(listPartnerCandidates(partnerCtx([]), {}, { page: 1, pageSize: 10, offset: 0 })).rejects.toThrow();
    await expect(listPartnerMobilisations(partnerCtx([]))).rejects.toThrow();
  });
});
