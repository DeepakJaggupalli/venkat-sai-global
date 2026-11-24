import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * staffExport's checks before any data is read: signed-in staff, the list's permission, and the staff two-factor rule
 * (a direct download link must not skip the set-up that every Command Centre page asks for). No database: the session,
 * settings, rate limiter and logs are mocked.
 */

const state = vi.hoisted(() => ({
  ctx: null as null | { user: { id: string; twoFactorEnabled: boolean }; roleKeys: string[]; permissions: Set<string>; isSuperAdmin: boolean },
  require2fa: false,
  built: 0,
}));

vi.mock("@/db", () => ({ db: {}, pool: {} }));
vi.mock("@/modules/identity/authz", () => ({
  getStaffContext: async () => state.ctx,
  staffCan: (ctx: { permissions: Set<string> } | null, permission: string | string[]) => Boolean(ctx) && (Array.isArray(permission) ? permission : [permission]).every((p) => ctx!.permissions.has(p)),
}));
vi.mock("@/modules/settings", () => ({ getSetting: async (key: string) => (key === "security.require_staff_2fa" ? state.require2fa : undefined) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true, remaining: 10, resetAt: new Date(), count: 1 }) }));
vi.mock("@/modules/audit", () => ({ audit: async () => undefined, logDataAccess: async () => undefined }));

const { staffExport } = await import("./http");

function download() {
  return staffExport<{ name: string }>({
    permission: "candidates.view",
    list: "test_list",
    slug: "test",
    build: async () => {
      state.built += 1;
      return { title: "Test list", filters: [], rows: [{ name: "Test Candidate" }], columns: [{ header: "Name", value: (r) => r.name }], total: 1 };
    },
  });
}

function staff(opts: { twoFactorEnabled: boolean; permissions?: string[] }) {
  return { user: { id: "00000000-0000-4000-8000-000000000001", twoFactorEnabled: opts.twoFactorEnabled }, roleKeys: ["test"], permissions: new Set(opts.permissions ?? ["candidates.view"]), isSuperAdmin: false };
}

describe("staffExport access checks", () => {
  beforeEach(() => {
    state.ctx = null;
    state.require2fa = false;
    state.built = 0;
  });

  it("needs signed-in staff with the list's permission", async () => {
    expect((await download()).status).toBe(401);
    state.ctx = staff({ twoFactorEnabled: true, permissions: ["candidates.manage"] });
    expect((await download()).status).toBe(403);
    expect(state.built).toBe(0);
  });

  it("refuses staff without two-factor sign-in when the Command Centre requires it", async () => {
    state.require2fa = true;
    state.ctx = staff({ twoFactorEnabled: false });
    const refused = await download();
    expect(refused.status).toBe(403);
    expect(await refused.text()).toMatch(/two-factor/i);
    expect(state.built).toBe(0);

    state.ctx = staff({ twoFactorEnabled: true });
    const ok = await download();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toContain("spreadsheetml");
    expect(state.built).toBe(1);
  });

  it("lets staff without two-factor sign-in download while the rule is off", async () => {
    state.ctx = staff({ twoFactorEnabled: false });
    expect((await download()).status).toBe(200);
  });
});
