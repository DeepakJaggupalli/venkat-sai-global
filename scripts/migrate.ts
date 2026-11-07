/**
 * Apply database migrations.
 *
 *   npm run db:migrate
 *
 * 1. Loads .env / .env.local (same rules as Next.js; real environment variables win).
 * 2. Creates the PostgreSQL extensions the schema relies on (pg_trgm, citext, unaccent).
 * 3. Applies the SQL migrations in ./drizzle (generated with `npm run db:generate`) using
 *    drizzle-orm's migrator, which records applied migrations in drizzle.__drizzle_migrations.
 *    MIGRATIONS_DIR overrides the folder (relative to the project root), e.g. for CI checks.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const migrationsFolder = path.resolve(root, process.env.MIGRATIONS_DIR?.trim() || "drizzle");

function redactUrl(url: string): string {
  return url.replace(/\/\/([^:/@]+):([^@]+)@/, "//$1:***@");
}

async function main(): Promise<number> {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(root, process.env.NODE_ENV !== "production", { info: () => undefined, error: console.error });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local (or set it in the environment).");
    return 1;
  }

  if (!fs.existsSync(path.join(migrationsFolder, "meta", "_journal.json"))) {
    console.error(
      [
        `No migrations found in ${migrationsFolder}.`,
        "Generate them from the schema first:",
        "  npm run db:generate      (writes ./drizzle/*.sql — commit them)",
        "then run `npm run db:migrate` again. For throwaway local databases, `npm run db:push` also works.",
      ].join("\n"),
    );
    return 1;
  }

  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  // The shared pool applies the same TLS / connection-string rules as the app (DATABASE_SSL…).
  const { pool } = await import("@/db");
  const started = Date.now();
  console.log(`Migrating ${redactUrl(connectionString)}`);
  try {
    await pool.query("create extension if not exists pg_trgm; create extension if not exists citext; create extension if not exists unaccent;");
    console.log("  [ok] extensions: pg_trgm, citext, unaccent");
    await migrate(drizzle({ client: pool, casing: "snake_case" }), { migrationsFolder });
    console.log(`  [ok] migrations applied from ${path.relative(root, migrationsFolder) || "."} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    return 0;
  } catch (error) {
    console.error("Migration failed:", error instanceof Error ? (error.stack ?? error.message) : error);
    return 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
