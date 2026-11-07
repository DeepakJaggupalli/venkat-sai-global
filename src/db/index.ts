import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Single shared PostgreSQL pool + Drizzle client.
 *
 * - `casing: "snake_case"` maps camelCase TS properties to snake_case columns.
 * - In development the pool is cached on globalThis so hot reloads do not leak connections.
 * - Works with any PostgreSQL 15+ (local bundled server, Neon, Azure, RDS, Supabase).
 */
type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __vsgPool?: Pool; __vsgDb?: Db };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined;
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl,
  });
}

export const pool: Pool = globalForDb.__vsgPool ?? createPool();
export const db: Db = globalForDb.__vsgDb ?? drizzle({ client: pool, schema, casing: "snake_case" });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__vsgPool = pool;
  globalForDb.__vsgDb = db;
}

/** Transaction handle type, for functions that accept either `db` or a transaction. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export { schema };
