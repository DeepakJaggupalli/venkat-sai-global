import { describe, expect, it } from "vitest";

import { seatsNote } from "./seats";

const check = (over: Partial<Parameters<typeof seatsNote>[0] & object> = {}) => ({ enforced: true, limit: 5, used: 2, allowed: true, reason: undefined, ...over });

describe("seatsNote", () => {
  it("says nothing when limits are not enforced, even if the plan has a cap", () => {
    expect(seatsNote(check({ enforced: false, used: 9 }), 3)).toBeNull();
  });

  it("says nothing for unlimited plans or a failed check", () => {
    expect(seatsNote(check({ limit: null }), 0)).toBeNull();
    expect(seatsNote(null, 0)).toBeNull();
  });

  it("counts pending invitations as reserved seats", () => {
    expect(seatsNote(check({ used: 2 }), 1)).toBe("3 of 5 seats in use on your plan (active members and pending invitations).");
  });

  it("explains what to do when every seat is taken", () => {
    expect(seatsNote(check({ used: 4 }), 1)).toMatch(/^5 of 5 seats in use .* Cancel an invitation, remove a member or upgrade the plan/);
  });

  it("uses the singular and appends the entitlement reason when not allowed", () => {
    expect(seatsNote(check({ limit: 1, used: 1, allowed: false, reason: "Your plan has no free team seats." }), 0)).toBe(
      "1 of 1 seat in use on your plan (active members and pending invitations). Your plan has no free team seats.",
    );
  });
});
