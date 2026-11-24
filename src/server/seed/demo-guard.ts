/**
 * Safety guard, account list and credentials-file helpers for the demo accounts (`npm run db:seed:demo`).
 * Pure (no database or server imports) so it can be unit-tested and checked before `@/db` is loaded.
 */
import path from "node:path";

import { DEMO_EMAIL_DOMAIN } from "@/lib/demo-accounts";

export { DEMO_EMAIL_DOMAIN };

export class DemoSeedRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoSeedRefused";
  }
}

// ---------------------------------------------------------------------------
// Command-line flags
// ---------------------------------------------------------------------------

export type DemoSeedFlags = { allowRemote: boolean; rotate: boolean; remove: boolean; help: boolean };

export const DEMO_SEED_USAGE = [
  "Usage: npm run db:seed:demo [-- <flags>]",
  "  (no flags)      create or reset the demo accounts; passwords are kept from the credentials file",
  "  --rotate        give every demo account a new password (signs them out)",
  "  --remove        delete (or close) every demo account and organisation, and the credentials file",
  "  --allow-remote  needed when DATABASE_URL is not this computer (for example the live database)",
].join("\n");

const FLAGS: Record<string, keyof DemoSeedFlags> = {
  "--allow-remote": "allowRemote",
  "--rotate": "rotate",
  "--remove": "remove",
  "--help": "help",
  "-h": "help",
};

/** Parses the runner's arguments. Unknown flags are refused (a typo must never fall back to a default). */
export function parseDemoSeedArgs(argv: readonly string[]): DemoSeedFlags {
  const flags: DemoSeedFlags = { allowRemote: false, rotate: false, remove: false, help: false };
  for (const arg of argv) {
    const key = FLAGS[arg];
    if (!key) throw new DemoSeedRefused(`Unknown option "${arg.slice(0, 40)}".\n${DEMO_SEED_USAGE}`);
    flags[key] = true;
  }
  if (flags.remove && flags.rotate) throw new DemoSeedRefused("Use --remove or --rotate, not both.");
  return flags;
}

// ---------------------------------------------------------------------------
// Database target
// ---------------------------------------------------------------------------

/** Hosts treated as "this computer". Anything else (Neon, a LAN host, a socket path) is remote. */
export const LOCAL_DB_HOSTS: readonly string[] = ["127.0.0.1", "localhost"];

/** A local PostgreSQL URL: loopback host and no `?host=` / `?hostaddr=` override (node-postgres honours both). */
export function isLocalDatabaseUrl(url: URL): boolean {
  if (!LOCAL_DB_HOSTS.includes(url.hostname.toLowerCase())) return false;
  for (const key of url.searchParams.keys()) {
    if (key.toLowerCase() === "host" || key.toLowerCase() === "hostaddr") return false;
  }
  return true;
}

/** host:port/database, never the user name or password. */
export function describeDatabase(url: URL): string {
  return `${url.hostname || "(socket)"}:${url.port || "5432"}${url.pathname || "/"}`;
}

export type DemoSeedTarget = { url: URL; local: boolean };

/**
 * Throws `DemoSeedRefused` when the demo seed must not run: on Vercel (any environment), without a valid
 * postgres DATABASE_URL, or against a database that is not on this computer unless `--allow-remote` was given.
 * Returns the parsed URL (password included — never log it) and whether it is local.
 */
export function assertDemoSeedAllowed(env: Readonly<Record<string, string | undefined>>, flags: Pick<DemoSeedFlags, "allowRemote">): DemoSeedTarget {
  if (env.VERCEL || env.VERCEL_ENV) throw new DemoSeedRefused("Refusing to run on Vercel. Run the demo seed from your own computer.");
  const raw = env.DATABASE_URL?.trim();
  if (!raw) throw new DemoSeedRefused("DATABASE_URL is not set.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DemoSeedRefused("DATABASE_URL is not a valid connection URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new DemoSeedRefused("DATABASE_URL must be a postgres:// URL.");
  const local = isLocalDatabaseUrl(url);
  if (!local && !flags.allowRemote) {
    throw new DemoSeedRefused(
      `DATABASE_URL points at "${url.hostname || "(none)"}", not this computer. Add --allow-remote to create the demo accounts there (for example the live site).`,
    );
  }
  return { url, local };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export type DemoAccountKey = "admin" | "staff" | "person" | "company" | "agency" | "partner" | "institution";

export type DemoOrganizationSpec = {
  type: "employer" | "recruitment_partner" | "institution";
  /** Employer organisations only. */
  employerKind?: "direct_company" | "travel_agency";
  name: string;
  description: string;
};

export type DemoAccountSpec = {
  key: DemoAccountKey;
  /** Email local part on DEMO_EMAIL_DOMAIN. */
  local: string;
  /** Display name; always starts with "Demo". */
  name: string;
  /** Portal name as the owner knows it. */
  portal: string;
  /** Portal home, used as the sign-in returnTo. */
  home: string;
  /** Platform role template key for Command Centre accounts. */
  staffRole?: string;
  organization?: DemoOrganizationSpec;
  /** One plain sentence for the credentials file. */
  about: string;
};

const ORG_NOTE = "Test organisation, not a real company.";

export const DEMO_ACCOUNTS: readonly DemoAccountSpec[] = [
  {
    key: "admin",
    local: "admin",
    name: "Demo Admin",
    portal: "Command Centre (Super Admin)",
    home: "/admin",
    staffRole: "super_admin",
    about: "Super Admin: sees and changes everything, including real candidates' details. Treat it like your own admin login.",
  },
  {
    key: "staff",
    local: "staff",
    name: "Demo Staff",
    portal: "Command Centre (staff, recruitment executive)",
    home: "/admin",
    staffRole: "recruiter",
    about: "Venkat Sai Recruiter role: candidates, CVs, requirements and the pipeline. No settings, no full passport numbers.",
  },
  {
    key: "person",
    local: "person",
    name: "Demo Person",
    portal: "People Portal",
    home: "/talent",
    about: "Demo Person, Pipe Welder in Visakhapatnam. Hidden from employers' candidate search. Do not apply to real jobs with it: the employer would see the application.",
  },
  {
    key: "company",
    local: "company",
    name: "Demo Company Owner",
    portal: "Company Portal",
    home: "/employer",
    organization: { type: "employer", employerKind: "direct_company", name: "Demo Company (test account)", description: `${ORG_NOTE} Used to try the Company Portal.` },
    about: "Owner of Demo Company (test account), verified.",
  },
  {
    key: "agency",
    local: "agency",
    name: "Demo Travel Agency Owner",
    portal: "Travel Agency Portal",
    home: "/agency",
    organization: { type: "employer", employerKind: "travel_agency", name: "Demo Travel Agency (test account)", description: `${ORG_NOTE} Used to try the Travel Agency Portal.` },
    about: "Owner of Demo Travel Agency (test account), verified.",
  },
  {
    key: "partner",
    local: "partner",
    name: "Demo Partner Owner",
    portal: "Recruitment Partner Portal",
    home: "/recruiter",
    organization: { type: "recruitment_partner", name: "Demo Recruitment Partner (test account)", description: `${ORG_NOTE} Used to try the Recruitment Partner Portal.` },
    about: "Owner of Demo Recruitment Partner (test account), verified.",
  },
  {
    key: "institution",
    local: "institution",
    name: "Demo Institution Owner",
    portal: "Institution Portal",
    home: "/institution",
    organization: { type: "institution", name: "Demo Training Institute (test account)", description: `${ORG_NOTE} Used to try the Institution Portal.` },
    about: "Owner of Demo Training Institute (test account), verified.",
  },
];

export const demoEmail = (local: string): string => `${local}@${DEMO_EMAIL_DOMAIN}`;

/** Sign-in link that lands in the account's portal (the sign-in page also highlights the matching account type). */
export function demoSignInPath(spec: Pick<DemoAccountSpec, "home">): string {
  return `/sign-in?returnTo=${spec.home}`;
}

/** Two-step sign-in state of a Command Centre account on the target site. */
export type StaffTwoFactorState = "set_up" | "required" | "optional";

/** Notes printed under an account in the credentials file. */
export function demoLoginNotes(spec: DemoAccountSpec, staffTwoFactor: StaffTwoFactorState): string[] {
  const notes = [spec.about];
  if (spec.staffRole) {
    notes.push(
      staffTwoFactor === "set_up"
        ? "Two-step sign-in is set up: also enter the 6-digit code from your authenticator app."
        : staffTwoFactor === "required"
          ? "First sign-in asks you to set up an authenticator app (two-step sign-in is required for staff)."
          : "Two-step sign-in is optional on this site (Account > Security).",
    );
    notes.push("Works on real data: what you publish or change here (requirements, jobs, candidates) is real and seen by real people.");
  }
  if (spec.organization) notes.push("Jobs, courses and announcements made with demo organisations never show on the public website or in the People Portal.");
  return notes;
}

// ---------------------------------------------------------------------------
// Credentials file
// ---------------------------------------------------------------------------

/** E:/VenkatSaiGlobal-work/secrets/demo-logins.txt next to the repository (outside it, never committed). */
export function defaultCredentialsFile(repoRoot: string): string {
  return path.join(repoRoot, "..", "VenkatSaiGlobal-work", "secrets", "demo-logins.txt");
}

/** Refuses a credentials file inside the repository (DEMO_LOGINS_FILE), where the passwords could be committed. */
export function assertCredentialsFileOutsideRepo(repoRoot: string, file: string): void {
  const relative = path.relative(path.resolve(repoRoot), path.resolve(file));
  const outside = relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (!outside) throw new DemoSeedRefused("DEMO_LOGINS_FILE must be outside the repository, so the passwords can never be committed.");
}

export type DemoLogin = { portal: string; signInPath: string; email: string; password: string; notes: readonly string[] };

export type CredentialsHeader = {
  generatedAt: Date;
  /** describeDatabase() of the target. */
  database: string;
  local: boolean;
  /** Website address for full links, or null to print paths only. */
  siteUrl: string | null;
};

function assertSingleLine(label: string, value: string): void {
  if (/[\r\n]/.test(value)) throw new Error(`${label} contains a line break`);
}

/** Readable list of the demo sign-ins (portal, sign-in link, email, password, notes). Read back by parseCredentialsFile(). */
export function formatCredentialsFile(logins: readonly DemoLogin[], header: CredentialsHeader): string {
  const site = header.siteUrl?.replace(/\/+$/, "") ?? null;
  const flag = header.local ? "" : " --allow-remote";
  const when = `${header.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const lines = [
    "VENKAT SAI GLOBAL: DEMO SIGN-IN ACCOUNTS",
    "PRIVATE. Anyone with this file can sign in. Never commit, share, print or paste it anywhere.",
    "",
    `Made:      ${when} by npm run db:seed:demo`,
    `Database:  ${header.local ? "local" : "REMOTE"} ${header.database}`,
    `Website:   ${site ?? "open your website, then use the sign-in links below"}`,
    "",
    `Test accounts on the reserved address ${DEMO_EMAIL_DOMAIN} (no email reaches them).`,
    "Their organisations and the demo person never appear on the public website.",
    `New passwords:  npm run db:seed:demo --${flag} --rotate`,
    `Remove all:     npm run db:seed:demo --${flag} --remove`,
  ];
  logins.forEach((login, index) => {
    for (const [label, value] of [
      ["portal", login.portal],
      ["sign-in path", login.signInPath],
      ["email", login.email],
      ["password", login.password],
      ...login.notes.map((note) => ["note", note] as const),
    ] as const) {
      assertSingleLine(`Demo login ${index + 1} ${label}`, value);
    }
    if (!login.password.trim() || /\s/.test(login.password)) throw new Error(`Demo login ${index + 1} password must be one word`);
    lines.push("", `${index + 1}. ${login.portal}`);
    lines.push(`   Sign in:  ${site ? `${site}${login.signInPath}` : login.signInPath}`);
    lines.push(`   Email:    ${login.email}`);
    lines.push(`   Password: ${login.password}`);
    login.notes.forEach((note, i) => lines.push(`   ${i === 0 ? "Notes:   " : "         "} ${note}`));
  });
  return `${lines.join("\n")}\n`;
}

/** Email (lower-case) → password from a file written by formatCredentialsFile(); anything else is ignored. */
export function parseCredentialsFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let email: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const emailMatch = /^Email:\s*(\S+@\S+)$/.exec(line);
    if (emailMatch) {
      email = emailMatch[1]!.toLowerCase();
      continue;
    }
    const passwordMatch = /^Password:\s*(\S+)$/.exec(line);
    if (passwordMatch && email) {
      out[email] = passwordMatch[1]!;
      email = null;
    }
  }
  return out;
}

/** The describeDatabase() value a credentials file was written for (its "Database:" line), or null when it has none. */
export function credentialsFileDatabase(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const match = /^Database:\s+(?:local|REMOTE)\s+(\S+)$/.exec(raw.trim());
    if (match) return match[1]!;
  }
  return null;
}

/** Website for full links: APP_URL for a local run; for a remote run only when APP_URL is not a localhost address. */
export function credentialsSiteUrl(appUrl: string | undefined, local: boolean): string | null {
  const value = appUrl?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
  if (!local && loopback) return null;
  return url.origin;
}
