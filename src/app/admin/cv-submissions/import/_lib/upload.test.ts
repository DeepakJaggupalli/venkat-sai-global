import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The checks every CV import POST runs before the file is read: same origin, staff with candidates.manage and the staff
 * two-factor rule (a direct POST must not skip the set-up the Command Centre pages ask for). No database.
 */

const state = vi.hoisted(() => ({
  ctx: null as null | { user: { id: string; twoFactorEnabled: boolean }; roleKeys: string[]; permissions: Set<string>; isSuperAdmin: boolean },
  require2fa: false,
}));

vi.mock("@/db", () => ({ db: {}, pool: {} }));
vi.mock("@/modules/identity/authz", () => ({
  getStaffContext: async () => state.ctx,
  staffCan: (ctx: { permissions: Set<string> } | null, permission: string) => Boolean(ctx?.permissions.has(permission)),
}));
vi.mock("@/modules/settings", () => ({ getSetting: async (key: string) => (key === "security.require_staff_2fa" ? state.require2fa : undefined) }));

const { readImportRequest } = await import("./upload");

function post(origin = "http://localhost:3000") {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "cvs.xlsx"));
  return new NextRequest("http://localhost:3000/admin/cv-submissions/import/check", { method: "POST", body: form, headers: { origin, host: "localhost:3000" } });
}

function staff(twoFactorEnabled: boolean, permissions = ["candidates.manage"]) {
  return { user: { id: "00000000-0000-4000-8000-000000000002", twoFactorEnabled }, roleKeys: ["test"], permissions: new Set(permissions), isSuperAdmin: false };
}

async function status(result: Awaited<ReturnType<typeof readImportRequest>>): Promise<number | "ok"> {
  return result instanceof Response ? result.status : "ok";
}

describe("CV import request checks", () => {
  beforeEach(() => {
    state.ctx = null;
    state.require2fa = false;
  });

  it("needs the same origin, signed-in staff and candidates.manage", async () => {
    state.ctx = staff(true);
    expect(await status(await readImportRequest(post("https://evil.example")))).toBe(403);
    state.ctx = null;
    expect(await status(await readImportRequest(post()))).toBe(401);
    state.ctx = staff(true, ["candidates.view"]);
    expect(await status(await readImportRequest(post()))).toBe(403);
    state.ctx = staff(true);
    expect(await status(await readImportRequest(post()))).toBe("ok");
  });

  it("refuses staff without two-factor sign-in when the Command Centre requires it", async () => {
    state.require2fa = true;
    state.ctx = staff(false);
    const refused = await readImportRequest(post());
    expect(refused).toBeInstanceOf(Response);
    expect((refused as Response).status).toBe(403);
    expect(await (refused as Response).json()).toMatchObject({ ok: false, code: "two_factor_required" });
    state.ctx = staff(true);
    expect(await status(await readImportRequest(post()))).toBe("ok");
  });
});
