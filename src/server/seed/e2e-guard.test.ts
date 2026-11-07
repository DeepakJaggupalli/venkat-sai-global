import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assertE2eSeedAllowed, E2eSeedRefused, formatEnvFile, parseEnvFile } from "./e2e-guard";

const LOCAL = "postgres://postgres:postgres@127.0.0.1:5433/venkatsai";

describe("E2E seed safety guard", () => {
  it("allows a local database outside production", () => {
    expect(assertE2eSeedAllowed({ DATABASE_URL: LOCAL, NODE_ENV: "development" }).hostname).toBe("127.0.0.1");
    expect(assertE2eSeedAllowed({ DATABASE_URL: "postgresql://u:p@localhost/vsg" }).hostname).toBe("localhost");
    expect(assertE2eSeedAllowed({ DATABASE_URL: "postgres://u:p@LOCALHOST:5433/vsg", NODE_ENV: "test" }).hostname.toLowerCase()).toBe("localhost");
  });

  it.each([
    ["Neon", "postgres://user:secret@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"],
    ["a LAN host", "postgres://u:p@192.168.1.20:5432/venkatsai"],
    ["a look-alike host", "postgres://u:p@localhost.example.com/venkatsai"],
    ["IPv6 loopback (not on the allow list)", "postgres://u:p@[::1]:5433/venkatsai"],
    ["a 127.0.0.1 prefix trick", "postgres://u:p@127.0.0.1.nip.io/venkatsai"],
    ["a host override in the query", "postgres://u:p@localhost/venkatsai?host=db.internal.example"],
    ["a hostaddr override in the query", "postgres://u:p@localhost/venkatsai?hostaddr=10.0.0.5"],
    ["a socket path", "postgres://u:p@/venkatsai?host=/var/run/postgresql"],
    ["a non-postgres URL", "mysql://u:p@127.0.0.1/venkatsai"],
    ["garbage", "not a url"],
  ])("refuses %s", (_label, url) => {
    expect(() => assertE2eSeedAllowed({ DATABASE_URL: url, NODE_ENV: "development" })).toThrow(E2eSeedRefused);
  });

  it("refuses a missing DATABASE_URL", () => {
    expect(() => assertE2eSeedAllowed({ NODE_ENV: "development" })).toThrow(/DATABASE_URL is not set/);
    expect(() => assertE2eSeedAllowed({ DATABASE_URL: "   " })).toThrow(E2eSeedRefused);
  });

  it("refuses production, even against a local database", () => {
    expect(() => assertE2eSeedAllowed({ DATABASE_URL: LOCAL, NODE_ENV: "production" })).toThrow(/NODE_ENV=production/);
  });

  it("refuses to run on Vercel", () => {
    expect(() => assertE2eSeedAllowed({ DATABASE_URL: LOCAL, VERCEL: "1" })).toThrow(/Vercel/);
    expect(() => assertE2eSeedAllowed({ DATABASE_URL: LOCAL, VERCEL_ENV: "preview" })).toThrow(/Vercel/);
  });

  it("never echoes the password in its messages", () => {
    try {
      assertE2eSeedAllowed({ DATABASE_URL: "postgres://user:sup3r-secret@db.example.com/x" });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("sup3r-secret");
    }
  });

  it("is not wired into the production seed", () => {
    const root = path.resolve(__dirname, "..", "..", "..");
    for (const file of ["scripts/seed.ts", "src/server/seed/index.ts"]) {
      expect(readFileSync(path.join(root, file), "utf8"), file).not.toMatch(/e2e/i);
    }
    const runner = readFileSync(path.join(root, "scripts/seed-e2e.ts"), "utf8");
    // The guard runs before the database module is loaded.
    expect(runner.indexOf("assertE2eSeedAllowed(process.env)")).toBeGreaterThan(-1);
    expect(runner.indexOf("assertE2eSeedAllowed(process.env)")).toBeLessThan(runner.indexOf('import("@/db")'));
  });
});

describe("E2E env file", () => {
  it("writes lines bash can source and reads them back", () => {
    const values = { E2E_ADMIN_EMAIL: "super-admin@e2e.venkatsai.test", E2E_ADMIN_PASSWORD: "Vsg-abc_DEF-123-9q", E2E_NOTE: "it's a test value" };
    const text = formatEnvFile(values, ["header"]);
    expect(text).toContain("# header\n");
    expect(text).toContain("E2E_ADMIN_EMAIL=super-admin@e2e.venkatsai.test\n");
    expect(text).toContain("E2E_NOTE='it'\\''s a test value'\n");
    expect(parseEnvFile(text)).toEqual(values);
  });

  it("rejects invalid keys and multi-line values", () => {
    expect(() => formatEnvFile({ "bad-key": "x" })).toThrow();
    expect(() => formatEnvFile({ E2E_X: "a\nb" })).toThrow();
  });
});
