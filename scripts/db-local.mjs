#!/usr/bin/env node
/**
 * Local PostgreSQL manager for development.
 *
 * Uses the PostgreSQL binaries shipped by the `embedded-postgres` platform
 * packages (no system-wide install, no Docker) and runs the server detached
 * through `pg_ctl`, so it keeps running after this script exits.
 *
 *   node scripts/db-local.mjs init     # create the cluster + application database
 *   node scripts/db-local.mjs start    # start (initialises first if needed)
 *   node scripts/db-local.mjs stop
 *   node scripts/db-local.mjs status
 *   node scripts/db-local.mjs reset    # stop, delete data dir, init + start (DESTROYS LOCAL DATA)
 *
 * Settings come from .env / .env.local (LOCAL_PG_PORT, LOCAL_PG_PASSWORD,
 * LOCAL_PG_DATABASE, LOCAL_PG_DATA_DIR). Never used in production.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load env files the same way Next.js does.
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(root, true, { info: () => {}, error: console.error });

const PORT = Number(process.env.LOCAL_PG_PORT ?? 5433);
const PASSWORD = process.env.LOCAL_PG_PASSWORD ?? "postgres";
const DATABASE = process.env.LOCAL_PG_DATABASE ?? "venkatsai";
const DATA_DIR = path.resolve(root, process.env.LOCAL_PG_DATA_DIR ?? ".data/postgres");
const LOG_FILE = path.resolve(path.dirname(DATA_DIR), "postgres.log");

if (process.env.NODE_ENV === "production") {
  console.error("db-local is a development tool and refuses to run with NODE_ENV=production.");
  process.exit(1);
}

function binDir() {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const pkg = `@embedded-postgres/${platform}-${process.arch}`;
  let entry;
  try {
    // The package only exports ./dist/index.js; its binaries live in ../native/bin.
    entry = require.resolve(pkg);
  } catch {
    console.error(`Could not find ${pkg}. Run "npm install" (embedded-postgres is a devDependency).`);
    process.exit(1);
  }
  return path.join(path.dirname(entry), "..", "native", "bin");
}

const exe = (name) => path.join(binDir(), process.platform === "win32" ? `${name}.exe` : name);

function run(cmd, args, { allowFail = false, detachedOutput = false } = {}) {
  // detachedOutput: the server started by pg_ctl would otherwise inherit our stdout/stderr
  // handles and keep the caller's pipe open forever (pg_ctl logs to -l <file> instead).
  const res = spawnSync(cmd, args, { stdio: detachedOutput ? "ignore" : "inherit", windowsHide: true });
  if (res.error) throw res.error;
  if (res.status !== 0 && !allowFail) {
    console.error(`${path.basename(cmd)} exited with code ${res.status}`);
    process.exit(res.status ?? 1);
  }
  return res.status ?? 0;
}

const isInitialised = () => fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));

function isRunning() {
  if (!isInitialised()) return false;
  const res = spawnSync(exe("pg_ctl"), ["status", "-D", DATA_DIR], { windowsHide: true });
  return res.status === 0;
}

function init() {
  if (isInitialised()) {
    console.log(`Cluster already initialised at ${DATA_DIR}`);
    return;
  }
  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  // Keep the transient password file next to the data dir (never in the OS temp dir).
  const pwFile = path.join(fs.mkdtempSync(path.join(path.dirname(DATA_DIR), "pwtmp-")), "pw.txt");
  fs.writeFileSync(pwFile, PASSWORD);
  try {
    run(exe("initdb"), [
      "-D", DATA_DIR,
      "-U", "postgres",
      `--pwfile=${pwFile}`,
      "-A", "scram-sha-256",
      "-E", "UTF8",
      "--no-locale",
    ]);
  } finally {
    fs.rmSync(path.dirname(pwFile), { recursive: true, force: true });
  }
  console.log(`Initialised cluster at ${DATA_DIR}`);
}

async function ensureDatabase() {
  const pg = require("pg");
  const client = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PASSWORD, database: "postgres" });
  await client.connect();
  try {
    const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [DATABASE]);
    if (!rowCount) {
      await client.query(`create database "${DATABASE.replace(/"/g, "")}"`);
      console.log(`Created database ${DATABASE}`);
    }
  } finally {
    await client.end();
  }
}

async function start() {
  if (!isInitialised()) init();
  if (isRunning()) {
    console.log(`PostgreSQL already running on port ${PORT}`);
  } else {
    run(exe("pg_ctl"), ["start", "-D", DATA_DIR, "-l", LOG_FILE, "-o", `-p ${PORT} -c listen_addresses=127.0.0.1`, "-w", "-t", "60"], {
      detachedOutput: true,
    });
    if (!isRunning()) {
      console.error(`PostgreSQL failed to start — see ${LOG_FILE}`);
      process.exit(1);
    }
    console.log(`PostgreSQL started on 127.0.0.1:${PORT} (log: ${LOG_FILE})`);
  }
  await ensureDatabase();
  console.log(`DATABASE_URL=postgres://postgres:${PASSWORD === "postgres" ? "postgres" : "****"}@127.0.0.1:${PORT}/${DATABASE}`);
}

function stop() {
  if (!isRunning()) {
    console.log("PostgreSQL is not running.");
    return;
  }
  run(exe("pg_ctl"), ["stop", "-D", DATA_DIR, "-m", "fast", "-w", "-t", "60"]);
}

function status() {
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Initialised: ${isInitialised()}`);
  console.log(`Running: ${isRunning()} (port ${PORT})`);
}

const cmd = process.argv[2] ?? "status";
switch (cmd) {
  case "init":
    init();
    break;
  case "start":
    await start();
    break;
  case "stop":
    stop();
    break;
  case "status":
    status();
    break;
  case "reset":
    stop();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    await start();
    break;
  default:
    console.error(`Unknown command "${cmd}". Use init | start | stop | status | reset.`);
    process.exit(1);
}
