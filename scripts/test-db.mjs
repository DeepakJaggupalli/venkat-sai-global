#!/usr/bin/env node
/**
 * Create (or recreate) an isolated PostgreSQL database with the CURRENT Drizzle schema pushed,
 * for integration tests and experiments. Never touches the main `venkatsai` database.
 *
 *   node scripts/test-db.mjs vsg_test_jobs          # drop + create + extensions + drizzle-kit push
 *   node scripts/test-db.mjs vsg_test_jobs --drop   # drop only
 *
 * Then run tests against it:
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_jobs'; npx vitest run src/modules/jobs
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(root, true, { info: () => {}, error: console.error });
const pg = require("pg");

const name = process.argv[2];
const dropOnly = process.argv.includes("--drop");
if (!name || !/^[a-z][a-z0-9_]{2,62}$/.test(name) || name === "venkatsai" || name === "postgres") {
  console.error("Usage: node scripts/test-db.mjs <db_name> [--drop]   (lowercase, not 'venkatsai')");
  process.exit(1);
}

const PORT = Number(process.env.LOCAL_PG_PORT ?? 5433);
const PASSWORD = process.env.LOCAL_PG_PASSWORD ?? "postgres";
const adminUrl = `postgres://postgres:${PASSWORD}@127.0.0.1:${PORT}/postgres`;
const dbUrl = `postgres://postgres:${PASSWORD}@127.0.0.1:${PORT}/${name}`;

async function withClient(url, fn) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

await withClient(adminUrl, async (c) => {
  await c.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()", [name]);
  await c.query(`drop database if exists "${name}"`);
  if (!dropOnly) await c.query(`create database "${name}"`);
});

if (dropOnly) {
  console.log(`Dropped ${name}`);
  process.exit(0);
}

await withClient(dbUrl, async (c) => {
  await c.query("create extension if not exists pg_trgm; create extension if not exists citext; create extension if not exists unaccent;");
});

const drizzleKitBin = path.join(root, "node_modules", "drizzle-kit", "bin.cjs");
const res = spawnSync(process.execPath, [drizzleKitBin, "push", "--force"], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: dbUrl },
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8",
});
const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
if (res.status !== 0 || /error/i.test(output.split("\n").slice(-15).join("\n")) && !/Changes applied/.test(output)) {
  console.error(output.split("\n").slice(-40).join("\n"));
  console.error(`Schema push failed for ${name}`);
  process.exit(1);
}
console.log(`Ready: ${dbUrl}`);
