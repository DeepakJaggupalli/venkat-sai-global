import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertCredentialsFileOutsideRepo,
  assertDemoSeedAllowed,
  credentialsFileDatabase,
  credentialsSiteUrl,
  defaultCredentialsFile,
  DEMO_ACCOUNTS,
  demoEmail,
  demoLoginNotes,
  demoSignInPath,
  DemoSeedRefused,
  describeDatabase,
  formatCredentialsFile,
  isLocalDatabaseUrl,
  parseCredentialsFile,
  parseDemoSeedArgs,
  type DemoLogin,
} from "./demo-guard";

const LOCAL = "postgres://postgres:postgres@127.0.0.1:5433/venkatsai";
const NEON = "postgres://owner:sup3r-secret@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const local = { allowRemote: false };
const remote = { allowRemote: true };

describe("demo seed guard", () => {
  it("allows a database on this computer", () => {
    expect(assertDemoSeedAllowed({ DATABASE_URL: LOCAL }, local)).toMatchObject({ local: true });
    expect(assertDemoSeedAllowed({ DATABASE_URL: "postgresql://u:p@localhost/vsg", NODE_ENV: "production" }, local).local).toBe(true);
    expect(assertDemoSeedAllowed({ DATABASE_URL: "postgres://u:p@LOCALHOST:5433/vsg" }, local).local).toBe(true);
  });

  it("needs --allow-remote for any other database", () => {
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: NEON }, local)).toThrow(DemoSeedRefused);
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: NEON }, local)).toThrow(/--allow-remote/);
    expect(assertDemoSeedAllowed({ DATABASE_URL: NEON }, remote)).toMatchObject({ local: false });
  });

  it.each([
    ["a LAN host", "postgres://u:p@192.168.1.20:5432/venkatsai"],
    ["a look-alike host", "postgres://u:p@localhost.example.com/venkatsai"],
    ["a 127.0.0.1 prefix trick", "postgres://u:p@127.0.0.1.nip.io/venkatsai"],
    ["a host override in the query", "postgres://u:p@localhost/venkatsai?host=db.internal.example"],
    ["a hostaddr override in the query", "postgres://u:p@localhost/venkatsai?HostAddr=10.0.0.5"],
  ])("treats %s as remote", (_label, url) => {
    expect(isLocalDatabaseUrl(new URL(url))).toBe(false);
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: url }, local)).toThrow(DemoSeedRefused);
  });

  it("refuses to run on Vercel, even with --allow-remote", () => {
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: LOCAL, VERCEL: "1" }, remote)).toThrow(/Vercel/);
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: NEON, VERCEL_ENV: "production" }, remote)).toThrow(/Vercel/);
  });

  it("refuses a missing, invalid or non-postgres DATABASE_URL", () => {
    expect(() => assertDemoSeedAllowed({}, remote)).toThrow(/DATABASE_URL is not set/);
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: "   " }, remote)).toThrow(DemoSeedRefused);
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: "not a url" }, remote)).toThrow(DemoSeedRefused);
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: "postgres://u:p@/venkatsai?host=/var/run/postgresql" }, remote)).toThrow(DemoSeedRefused);
    expect(() => assertDemoSeedAllowed({ DATABASE_URL: "mysql://u:p@127.0.0.1/venkatsai" }, remote)).toThrow(/postgres/);
  });

  it("never shows the user name or password", () => {
    try {
      assertDemoSeedAllowed({ DATABASE_URL: NEON }, local);
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toMatch(/sup3r-secret|owner/);
    }
    expect(describeDatabase(new URL(NEON))).toBe("ep-cool-name-123456.ap-southeast-1.aws.neon.tech:5432/neondb");
    expect(describeDatabase(new URL(LOCAL))).toBe("127.0.0.1:5433/venkatsai");
  });
});

describe("demo seed flags", () => {
  it("reads the known flags", () => {
    expect(parseDemoSeedArgs([])).toEqual({ allowRemote: false, rotate: false, remove: false, help: false });
    expect(parseDemoSeedArgs(["--allow-remote", "--rotate"])).toMatchObject({ allowRemote: true, rotate: true });
    expect(parseDemoSeedArgs(["--remove"]).remove).toBe(true);
    expect(parseDemoSeedArgs(["-h"]).help).toBe(true);
  });

  it("refuses unknown flags and --remove with --rotate", () => {
    expect(() => parseDemoSeedArgs(["--allow-remot"])).toThrow(/Unknown option/);
    expect(() => parseDemoSeedArgs(["--keep-passwords"])).toThrow(DemoSeedRefused);
    expect(() => parseDemoSeedArgs(["--remove", "--rotate"])).toThrow(/not both/);
  });
});

describe("demo accounts", () => {
  it("cover every portal on the reserved domain, with names starting with Demo", () => {
    expect(DEMO_ACCOUNTS.map((a) => a.key)).toEqual(["admin", "staff", "person", "company", "agency", "partner", "institution"]);
    expect(DEMO_ACCOUNTS.map((a) => demoEmail(a.local))).toEqual([
      "admin@demo.venkatsai.test",
      "staff@demo.venkatsai.test",
      "person@demo.venkatsai.test",
      "company@demo.venkatsai.test",
      "agency@demo.venkatsai.test",
      "partner@demo.venkatsai.test",
      "institution@demo.venkatsai.test",
    ]);
    expect(DEMO_ACCOUNTS.map((a) => a.home)).toEqual(["/admin", "/admin", "/talent", "/employer", "/agency", "/recruiter", "/institution"]);
    for (const account of DEMO_ACCOUNTS) {
      expect(account.name).toMatch(/^Demo /);
      if (account.organization) expect(account.organization.name).toMatch(/^Demo .*\(test account\)$/);
    }
    const byKey = Object.fromEntries(DEMO_ACCOUNTS.map((a) => [a.key, a]));
    expect(byKey.admin!.staffRole).toBe("super_admin");
    expect(byKey.staff!.staffRole).toBe("recruiter");
    expect(byKey.person!.staffRole ?? byKey.person!.organization).toBeUndefined();
    expect(byKey.company!.organization).toMatchObject({ type: "employer", employerKind: "direct_company", name: "Demo Company (test account)" });
    expect(byKey.agency!.organization).toMatchObject({ type: "employer", employerKind: "travel_agency", name: "Demo Travel Agency (test account)" });
    expect(byKey.partner!.organization?.type).toBe("recruitment_partner");
    expect(byKey.institution!.organization?.type).toBe("institution");
  });

  it("sign in straight into their portal", () => {
    expect(DEMO_ACCOUNTS.map(demoSignInPath)).toEqual([
      "/sign-in?returnTo=/admin",
      "/sign-in?returnTo=/admin",
      "/sign-in?returnTo=/talent",
      "/sign-in?returnTo=/employer",
      "/sign-in?returnTo=/agency",
      "/sign-in?returnTo=/recruiter",
      "/sign-in?returnTo=/institution",
    ]);
  });

  it("tell staff about two-step sign-in", () => {
    const admin = DEMO_ACCOUNTS[0]!;
    expect(demoLoginNotes(admin, "required").join(" ")).toMatch(/First sign-in asks you to set up an authenticator app/);
    expect(demoLoginNotes(admin, "set_up").join(" ")).toMatch(/6-digit code/);
    expect(demoLoginNotes(admin, "optional").join(" ")).toMatch(/optional/);
    const company = DEMO_ACCOUNTS.find((a) => a.key === "company")!;
    expect(demoLoginNotes(company, "required").join(" ")).not.toMatch(/authenticator/);
    expect(demoLoginNotes(company, "required").join(" ")).toMatch(/never show on the public website/);
  });

  it("warn staff that they work on real data, unlike the hidden demo organisations", () => {
    for (const account of DEMO_ACCOUNTS) {
      const notes = demoLoginNotes(account, "required").join(" ");
      if (account.staffRole) expect(notes, account.key).toMatch(/Works on real data: .* is real and seen by real people/);
      else expect(notes, account.key).not.toMatch(/Works on real data/);
    }
  });
});

describe("credentials file", () => {
  const logins: DemoLogin[] = [
    { portal: "Command Centre (Super Admin)", signInPath: "/sign-in?returnTo=/admin", email: "admin@demo.venkatsai.test", password: "Vsg-AbC_123-xyz-9q", notes: ["Super Admin.", "First sign-in asks you to set up an authenticator app."] },
    { portal: "People Portal", signInPath: "/sign-in?returnTo=/talent", email: "person@demo.venkatsai.test", password: "Vsg-Q'w\"e$r-9q", notes: ["Demo Person."] },
  ];
  const header = { generatedAt: new Date("2026-11-23T10:15:30Z"), database: "127.0.0.1:5433/venkatsai", local: true, siteUrl: "http://localhost:3000/" };

  it("lists portal, sign-in link, email, password and notes, and reads the passwords back", () => {
    const text = formatCredentialsFile(logins, header);
    expect(text).toContain("PRIVATE. Anyone with this file can sign in.");
    expect(text).toContain("Made:      2026-11-23 10:15 UTC by npm run db:seed:demo");
    expect(text).toContain("Database:  local 127.0.0.1:5433/venkatsai");
    expect(text).toContain(
      [
        "1. Command Centre (Super Admin)",
        "   Sign in:  http://localhost:3000/sign-in?returnTo=/admin",
        "   Email:    admin@demo.venkatsai.test",
        "   Password: Vsg-AbC_123-xyz-9q",
        "   Notes:    Super Admin.",
        "             First sign-in asks you to set up an authenticator app.",
      ].join("\n"),
    );
    expect(text).toContain("Remove all:     npm run db:seed:demo -- --remove");
    expect(text.endsWith("\n")).toBe(true);
    expect(parseCredentialsFile(text)).toEqual({ "admin@demo.venkatsai.test": "Vsg-AbC_123-xyz-9q", "person@demo.venkatsai.test": "Vsg-Q'w\"e$r-9q" });
    expect(parseCredentialsFile(text.replace(/\n/g, "\r\n"))).toEqual(parseCredentialsFile(text));
  });

  it("prints paths when the website is unknown, and the remote flag in the commands", () => {
    const text = formatCredentialsFile(logins, { ...header, local: false, siteUrl: null, database: "db.example.com:5432/neondb" });
    expect(text).toContain("   Sign in:  /sign-in?returnTo=/admin");
    expect(text).toContain("Database:  REMOTE db.example.com:5432/neondb");
    expect(text).toContain("New passwords:  npm run db:seed:demo -- --allow-remote --rotate");
    expect(text).toContain("Remove all:     npm run db:seed:demo -- --allow-remote --remove");
  });

  it("refuses values that would break the file", () => {
    expect(() => formatCredentialsFile([{ ...logins[0]!, password: "two words" }], header)).toThrow(/one word/);
    expect(() => formatCredentialsFile([{ ...logins[0]!, password: "" }], header)).toThrow();
    expect(() => formatCredentialsFile([{ ...logins[0]!, notes: ["a\nPassword: injected"] }], header)).toThrow(/line break/);
    expect(() => formatCredentialsFile([{ ...logins[0]!, email: "x@demo.venkatsai.test\r\n" }], header)).toThrow(/line break/);
  });

  it("knows which database a file was written for", () => {
    expect(credentialsFileDatabase(formatCredentialsFile(logins, header))).toBe("127.0.0.1:5433/venkatsai");
    const live = formatCredentialsFile(logins, { ...header, local: false, database: "ep-x.neon.tech:5432/neondb" }).replace(/\n/g, "\r\n");
    expect(credentialsFileDatabase(live)).toBe("ep-x.neon.tech:5432/neondb");
    expect(credentialsFileDatabase("Email: a@demo.venkatsai.test\nPassword: x")).toBeNull();
  });

  it("ignores anything that is not an email and password pair", () => {
    expect(parseCredentialsFile("")).toEqual({});
    expect(parseCredentialsFile("Password: orphan\nEmail: A@Demo.Venkatsai.Test\nNotes: x\nPassword: pw-1\nPassword: pw-2")).toEqual({ "a@demo.venkatsai.test": "pw-1" });
  });

  it("lives outside the repository, in the secrets folder", () => {
    const repo = path.resolve("/work/VenkatSaiGlobal");
    const file = defaultCredentialsFile(repo);
    expect(file).toBe(path.resolve("/work/VenkatSaiGlobal-work/secrets/demo-logins.txt"));
    expect(path.relative(repo, file).startsWith("..")).toBe(true);
    expect(() => assertCredentialsFileOutsideRepo(repo, file)).not.toThrow();
  });

  it("refuses a credentials file inside the repository", () => {
    const repo = path.resolve("/work/VenkatSaiGlobal");
    for (const inside of [repo, path.join(repo, "demo-logins.txt"), path.join(repo, "..VenkatSaiGlobal", "x.txt"), path.join(repo, "secrets", "..", "demo.txt")]) {
      expect(() => assertCredentialsFileOutsideRepo(repo, inside), inside).toThrow(DemoSeedRefused);
    }
    expect(() => assertCredentialsFileOutsideRepo(repo, path.resolve("/work/VenkatSaiGlobal-other/demo.txt"))).not.toThrow();
  });

  it("uses APP_URL for links only when it matches the target", () => {
    expect(credentialsSiteUrl("http://localhost:3000/", true)).toBe("http://localhost:3000");
    expect(credentialsSiteUrl("http://localhost:3000", false)).toBeNull();
    expect(credentialsSiteUrl("https://venkat-sai-global.vercel.app/jobs", false)).toBe("https://venkat-sai-global.vercel.app");
    expect(credentialsSiteUrl(undefined, true)).toBeNull();
    expect(credentialsSiteUrl("javascript:alert(1)", true)).toBeNull();
    expect(credentialsSiteUrl("not a url", true)).toBeNull();
  });
});

describe("demo seed runner", () => {
  const root = path.resolve(__dirname, "..", "..", "..");
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");

  it("checks the guard before the database loads and never prints passwords", () => {
    const runner = read("scripts/seed-demo.ts");
    const guardAt = runner.indexOf("assertDemoSeedAllowed(process.env, flags)");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(runner.indexOf('import("@/db")'));
    expect(runner).not.toMatch(/console\.\w+\([^;]*\.password\b/);
    expect(runner).toContain("mode: 0o600");
  });

  it("deletes the credentials file on --remove only when it was written for the same database", () => {
    const runner = read("scripts/seed-demo.ts");
    const check = runner.indexOf("guard.credentialsFileDatabase(");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(runner.indexOf("rmSync(file"));
  });

  it("is a separate npm script, never part of the production seed", () => {
    expect(JSON.parse(read("package.json")).scripts["db:seed:demo"]).toBe("tsx --conditions=react-server scripts/seed-demo.ts");
    for (const file of ["scripts/seed.ts", "src/server/seed/index.ts"]) {
      expect(read(file), file).not.toMatch(/seed-demo|seed\/demo|runDemoSeed/);
    }
  });
});
