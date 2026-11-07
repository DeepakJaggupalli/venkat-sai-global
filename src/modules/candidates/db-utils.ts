import "server-only";

import { db, type DbOrTx } from "@/db";

/**
 * Run independent queries in parallel on the pool, but one after another inside a transaction:
 * a transaction is a single pg client, which must not run overlapping queries (deprecated in pg 8,
 * an error in pg 9).
 *
 *   const [a, b] = await runQueries(tx, () => tx.select()…, () => tx.select()…);
 */
export async function runQueries<T extends unknown[]>(tx: DbOrTx, ...thunks: { [K in keyof T]: () => PromiseLike<T[K]> }): Promise<T> {
  if (tx === db) return (await Promise.all(thunks.map((thunk) => thunk()))) as T;
  const results: unknown[] = [];
  for (const thunk of thunks) results.push(await thunk());
  return results as T;
}
