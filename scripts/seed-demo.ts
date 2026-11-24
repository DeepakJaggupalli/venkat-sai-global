/**
 * Demo sign-in accounts for every portal, so Venkat Sai can try the whole platform (also on the live site):
 * Command Centre (Super Admin and a staff member), People Portal, Company Portal, Travel Agency Portal,
 * Recruitment Partner Portal and Institution Portal. Logic: src/server/seed/demo.ts.
 *
 *   npm run db:seed:demo                          # create or reset; passwords kept from the credentials file
 *   npm run db:seed:demo -- --rotate              # new password for every demo account (signs them out)
 *   npm run db:seed:demo -- --remove              # delete (or close) every demo account and organisation
 *   npm run db:seed:demo -- --allow-remote ...    # required when DATABASE_URL is not this computer
 *
 * Refuses to run on Vercel, and against a database that is not on this computer unless --allow-remote is given
 * (src/server/seed/demo-guard.ts, checked before the database module loads). Run `npm run db:migrate` and
 * `npm run db:seed` first.
 *
 * Writes the sign-ins to DEMO_LOGINS_FILE (default: ../VenkatSaiGlobal-work/secrets/demo-logins.txt next to the
 * repository, mode 600). Passwords are never printed. Never commit, share or paste that file.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";

const root = path.resolve(__dirname, "..");

/** Same alias as scripts/seed.ts: resolve next/navigation to its react-server build outside Next.js. */
function aliasReactServerNavigation(): void {
  const target = require.resolve("next/dist/client/components/navigation.react-server.js");
  const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const original = loader._resolveFilename;
  loader._resolveFilename = function resolve(this: unknown, request: string, ...rest: unknown[]): string {
    if (request === "next/navigation" || request === "next/navigation.js") return target;
    return original.call(this, request, ...rest);
  };
}
aliasReactServerNavigation();

/** Services record server-side analytics after commits; outside a request that is expected to be skipped. */
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]): void => {
  if (typeof args[0] === "string" && args[0].includes("Server-side analytics event was not recorded")) return;
  originalWarn(...args);
};

async function main(): Promise<number> {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(root, process.env.NODE_ENV !== "production", { info: () => undefined, error: console.error });

  const guard = await import("@/server/seed/demo-guard");
  let flags: ReturnType<typeof guard.parseDemoSeedArgs>;
  let target: ReturnType<typeof guard.assertDemoSeedAllowed>;
  let file: string;
  try {
    flags = guard.parseDemoSeedArgs(process.argv.slice(2));
    if (flags.help) {
      console.log(guard.DEMO_SEED_USAGE);
      return 0;
    }
    target = guard.assertDemoSeedAllowed(process.env, flags);
    file = path.resolve(process.env.DEMO_LOGINS_FILE ?? guard.defaultCredentialsFile(root));
    guard.assertCredentialsFileOutsideRepo(root, file);
  } catch (error) {
    if (error instanceof guard.DemoSeedRefused) {
      console.error(`Demo seed refused: ${error.message}`);
      return 2;
    }
    throw error;
  }

  const database = guard.describeDatabase(target.url);
  const mode = flags.remove ? "removing" : flags.rotate ? "new passwords" : "passwords kept";
  console.log(`Demo accounts on ${target.local ? "the local database" : "a REMOTE database"} ${database} (${mode})`);
  const started = Date.now();
  // Imported only after the guard: loading @/db opens a pool to DATABASE_URL.
  const { pool } = await import("@/db");
  try {
    const demo = await import("@/server/seed/demo");
    if (flags.remove) {
      const summary = await demo.removeDemoAccounts({ log: (message) => console.log(message) });
      console.log(
        `Removed: ${summary.organizationsDeleted} organisations deleted, ${summary.organizationsClosed} closed; ${summary.usersDeleted} accounts deleted, ${summary.usersClosed} closed.`,
      );
      if (summary.keptSuperAdmins.length) {
        console.log("Kept the only active Super Admin. Give another person the Super Admin role, then run --remove again.");
      } else if (existsSync(file)) {
        // The same file may hold the live site's sign-ins: only delete it when it was written for this database.
        const listed = guard.credentialsFileDatabase(readFileSync(file, "utf8"));
        if (listed && listed !== database) {
          console.log(`Kept ${file}: it lists the sign-ins of another database (${listed}).`);
        } else {
          rmSync(file, { force: true });
          console.log(`Deleted ${file}`);
        }
      }
    } else {
      const kept = !flags.rotate && existsSync(file) ? guard.parseCredentialsFile(readFileSync(file, "utf8")) : {};
      const result = await demo.runDemoSeed({ keptPasswords: kept, local: target.local, log: (message) => console.log(message) });
      mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const text = guard.formatCredentialsFile(result.logins, {
        generatedAt: new Date(),
        database,
        local: target.local,
        siteUrl: guard.credentialsSiteUrl(process.env.APP_URL, target.local),
      });
      writeFileSync(file, text, { encoding: "utf8", mode: 0o600 });
      try {
        chmodSync(file, 0o600);
      } catch {
        // Windows keeps its own file permissions.
      }
      console.log("Sign-ins:");
      for (const login of result.logins) console.log(`  ${login.portal}: ${login.email}`);
      console.log(`Passwords saved to ${file}`);
      if (!target.local) console.log("These sign-ins work on the live site. When you have finished checking, remove them with --allow-remote --remove.");
    }
  } catch (error) {
    console.error("Demo seed failed:", error instanceof Error ? (error.stack ?? error.message) : error);
    return 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
