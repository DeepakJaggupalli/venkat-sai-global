/**
 * Production seed: reference data (currencies, countries, Indian states, languages, industries,
 * job categories, skills, education levels, qualification types), default roles, the first
 * Super Admin (from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD), then each module's own seed.
 *
 *   npm run db:seed
 *
 * Idempotent: run it after every migration/deploy. It inserts what is missing (matched by natural
 * keys) and never overwrites data administrators have edited. Never seeds demo or business data.
 */
import Module from "node:module";
import path from "node:path";

const root = path.resolve(__dirname, "..");

/**
 * The script runs with `--conditions=react-server` (so `server-only` imports are allowed), but
 * plain Node then resolves `next/navigation` to its client build, which needs client React APIs.
 * Point it at the react-server build Next.js itself uses for server code (redirect, notFound,
 * forbidden, unstable_rethrow).
 */
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

function redactUrl(url: string): string {
  return url.replace(/\/\/([^:/@]+):([^@]+)@/, "//$1:***@");
}

const MODULE_SEEDS: readonly [name: string, load: () => Promise<{ seed: () => Promise<void> }>][] = [
  ["recruitment", () => import("@/modules/recruitment/seed")],
  ["content", () => import("@/modules/content/seed")],
  ["notifications", () => import("@/modules/notifications/seed")],
  ["commercial", () => import("@/modules/commercial/seed")],
  ["analytics", () => import("@/modules/analytics/seed")],
  ["training", () => import("@/modules/training/seed")],
];

async function main(): Promise<number> {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(root, process.env.NODE_ENV !== "production", { info: () => undefined, error: console.error });
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local (or set it in the environment).");
    return 1;
  }

  const started = Date.now();
  console.log(`Seeding ${redactUrl(process.env.DATABASE_URL)}`);
  const { pool } = await import("@/db");
  let failures = 0;
  try {
    console.log("Reference data and roles:");
    const { runReferenceSeeds } = await import("@/server/seed");
    await runReferenceSeeds((r) => {
      console.log(`  [ok] ${r.name}: ${r.inserted} inserted, ${r.updated} updated, ${r.total} defined${r.note ? ` (${r.note})` : ""}`);
    });

    if (process.env.SEED_ONLY_REFERENCE === "1") {
      console.log("Module seeds: skipped (SEED_ONLY_REFERENCE=1)");
      return 0;
    }
    console.log("Module seeds:");
    for (const [name, load] of MODULE_SEEDS) {
      const moduleStarted = Date.now();
      try {
        const mod = await load();
        await mod.seed();
        console.log(`  [ok] ${name} (${Date.now() - moduleStarted} ms)`);
      } catch (error) {
        failures += 1;
        console.error(`  [failed] ${name}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      }
    }
  } catch (error) {
    console.error("Reference seed failed:", error instanceof Error ? (error.stack ?? error.message) : error);
    return 1;
  } finally {
    await pool.end().catch(() => undefined);
  }

  console.log(`Seed finished in ${((Date.now() - started) / 1000).toFixed(1)} s${failures ? ` with ${failures} module seed failure(s)` : ""}.`);
  return failures ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
