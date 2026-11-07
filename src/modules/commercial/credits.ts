import "server-only";

import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { creditLedger, organizations, type CreditLedgerReason } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";
import type { StaffContext } from "@/modules/identity/authz";

import { assertStaff } from "./access";
import { ENTITLEMENTS } from "./constants";
import type { EntitlementKey } from "./entitlements";
import { notFound } from "./errors";
import { dueLots, LOT_REFERENCE_TYPE, simulateLots, subscriptionLots, type CreditLot, type LedgerEntry } from "./lots";

/**
 * Credit ledger primitives (append-only; see credit_ledger in src/db/schema/commercial.ts).
 *
 * Concurrency: every write for an (organisation, key) first takes a transaction-scoped advisory lock on that
 * pair, then reads the head row (highest `seq`) and inserts seq + 1 with the new running balance. Concurrent
 * writers therefore queue instead of reading the same balance; the (organisation, key, seq) unique constraint
 * stays as a backstop. Idempotency keys make retries safe (a duplicate returns the original entry).
 */

export type LedgerWrite = {
  organizationId: string;
  entitlementKey: EntitlementKey;
  delta: number;
  reason: CreditLedgerReason;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  expiresAt?: Date | null;
  actorUserId?: string | null;
  note?: string | null;
};

export type LedgerWriteResult = { id: string; seq: number; balanceAfter: number; duplicate: boolean };

/** Serialise writers of one (organisation, key) ledger until the transaction ends. */
export async function lockLedger(tx: DbOrTx, organizationId: string, key: EntitlementKey): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`credit:${organizationId}:${key}`}, 0))`);
}

export async function ledgerHead(tx: DbOrTx, organizationId: string, key: EntitlementKey): Promise<{ seq: number; balance: number }> {
  const [head] = await tx
    .select({ seq: creditLedger.seq, balance: creditLedger.balanceAfter })
    .from(creditLedger)
    .where(and(eq(creditLedger.organizationId, organizationId), eq(creditLedger.entitlementKey, key)))
    .orderBy(desc(creditLedger.seq))
    .limit(1);
  return head ?? { seq: 0, balance: 0 };
}

async function findByIdempotencyKey(tx: DbOrTx, organizationId: string, idempotencyKey: string): Promise<LedgerWriteResult | null> {
  const [row] = await tx
    .select({ id: creditLedger.id, seq: creditLedger.seq, balanceAfter: creditLedger.balanceAfter })
    .from(creditLedger)
    .where(and(eq(creditLedger.organizationId, organizationId), eq(creditLedger.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ? { ...row, duplicate: true } : null;
}

/**
 * Append one entry. The caller MUST hold the ledger lock (lockLedger) in `tx`. Returns the existing entry when
 * the idempotency key was already used.
 */
export async function appendLocked(tx: DbOrTx, write: LedgerWrite): Promise<LedgerWriteResult> {
  if (!Number.isSafeInteger(write.delta) || write.delta === 0) throw new RangeError("Ledger delta must be a non-zero integer");
  if (write.idempotencyKey) {
    const existing = await findByIdempotencyKey(tx, write.organizationId, write.idempotencyKey);
    if (existing) return existing;
  }
  const head = await ledgerHead(tx, write.organizationId, write.entitlementKey);
  const [row] = await tx
    .insert(creditLedger)
    .values({
      organizationId: write.organizationId,
      entitlementKey: write.entitlementKey,
      seq: head.seq + 1,
      delta: write.delta,
      balanceAfter: head.balance + write.delta,
      reason: write.reason,
      referenceType: write.referenceType ?? null,
      referenceId: write.referenceId ?? null,
      idempotencyKey: write.idempotencyKey ?? null,
      expiresAt: write.expiresAt ?? null,
      actorUserId: write.actorUserId ?? null,
      note: write.note ?? null,
    })
    .returning({ id: creditLedger.id, seq: creditLedger.seq, balanceAfter: creditLedger.balanceAfter });
  return { ...row!, duplicate: false };
}

async function inTx<T>(tx: DbOrTx | undefined, run: (t: DbOrTx) => Promise<T>): Promise<T> {
  return tx ? run(tx) : db.transaction(run);
}

export const OVERDRAFT_NOTE = "Usage recorded while limits were not enforced (or under an unlimited plan) is not carried against new credits.";

/**
 * Add credits (plan grant, purchase, refund of consumption). An overdraft (negative balance, only possible while
 * limits are off or the feature is unlimited) is written off first with an `adjustment`, so new credits are never
 * consumed by unenforced usage. Idempotent by `idempotencyKey`.
 */
export async function grantCredits(write: LedgerWrite & { reason: "plan_grant" | "purchase" | "refund" | "adjustment" }, tx?: DbOrTx): Promise<LedgerWriteResult> {
  if (write.delta <= 0) throw new RangeError("Granted credits must be positive");
  return inTx(tx, async (t) => {
    await lockLedger(t, write.organizationId, write.entitlementKey);
    if (write.idempotencyKey) {
      const existing = await findByIdempotencyKey(t, write.organizationId, write.idempotencyKey);
      if (existing) return existing;
    }
    const head = await ledgerHead(t, write.organizationId, write.entitlementKey);
    if (head.balance < 0) {
      await appendLocked(t, {
        organizationId: write.organizationId,
        entitlementKey: write.entitlementKey,
        delta: -head.balance,
        reason: "adjustment",
        referenceType: write.referenceType,
        referenceId: write.referenceId,
        idempotencyKey: write.idempotencyKey ? `overdraft:${write.idempotencyKey}` : null,
        note: OVERDRAFT_NOTE,
      });
    }
    return appendLocked(t, write);
  });
}

export async function getCreditBalance(organizationId: string, key: EntitlementKey, tx: DbOrTx = db): Promise<number> {
  return (await ledgerHead(tx, organizationId, key)).balance;
}

/** Latest balance per key for an organisation (keys without entries are omitted). */
export async function getCreditBalances(organizationId: string, tx: DbOrTx = db): Promise<Partial<Record<EntitlementKey, number>>> {
  const rows = await tx.execute<{ entitlement_key: EntitlementKey; balance_after: number | string }>(sql`
    select distinct on (entitlement_key) entitlement_key, balance_after
    from credit_ledger where organization_id = ${organizationId}
    order by entitlement_key, seq desc
  `);
  return Object.fromEntries(rows.rows.map((r) => [r.entitlement_key, Number(r.balance_after)]));
}

/** Credits consumed in [start, end) (consumption entries only). */
export async function consumedInWindow(organizationId: string, key: EntitlementKey, start: Date, end: Date, tx: DbOrTx = db): Promise<number> {
  const [row] = await tx
    .select({ value: sql<string>`coalesce(sum(-${creditLedger.delta}), 0)` })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.organizationId, organizationId),
        eq(creditLedger.entitlementKey, key),
        eq(creditLedger.reason, "consumption"),
        gte(creditLedger.createdAt, start),
        lt(creditLedger.createdAt, end),
      ),
    );
  return Number(row?.value ?? 0);
}

async function loadEntries(tx: DbOrTx, organizationId: string, key: EntitlementKey): Promise<LedgerEntry[]> {
  return tx
    .select({
      id: creditLedger.id,
      seq: creditLedger.seq,
      delta: creditLedger.delta,
      reason: creditLedger.reason,
      expiresAt: creditLedger.expiresAt,
      referenceType: creditLedger.referenceType,
      referenceId: creditLedger.referenceId,
    })
    .from(creditLedger)
    .where(and(eq(creditLedger.organizationId, organizationId), eq(creditLedger.entitlementKey, key)))
    .orderBy(asc(creditLedger.seq));
}

async function writeExpiries(tx: DbOrTx, organizationId: string, key: EntitlementKey, lots: readonly CreditLot[], note: string): Promise<number> {
  let expired = 0;
  for (const lot of lots) {
    const result = await appendLocked(tx, {
      organizationId,
      entitlementKey: key,
      delta: -lot.remaining,
      reason: "expiry",
      referenceType: LOT_REFERENCE_TYPE,
      referenceId: lot.id,
      idempotencyKey: `expire:${lot.id}`,
      note,
    });
    if (!result.duplicate) expired += lot.remaining;
  }
  return expired;
}

/**
 * Expire credits whose expiry time has passed (the unused part of each lot, see lots.ts). Only ledgers with a
 * positive balance can hold unused credits, so only those are replayed. Returns the number of credits expired.
 */
export async function expireDueCredits(now: Date = new Date(), opts: { organizationId?: string } = {}): Promise<number> {
  const candidates = await db.execute<{ organization_id: string; entitlement_key: EntitlementKey }>(sql`
    select distinct l.organization_id, l.entitlement_key
    from credit_ledger l
    where l.delta > 0 and l.expires_at is not null and l.expires_at <= ${now}
      ${opts.organizationId ? sql`and l.organization_id = ${opts.organizationId}` : sql``}
      and not exists (
        select 1 from credit_ledger e
        where e.organization_id = l.organization_id and e.idempotency_key = 'expire:' || l.id::text
      )
      and (
        select c.balance_after from credit_ledger c
        where c.organization_id = l.organization_id and c.entitlement_key = l.entitlement_key
        order by c.seq desc limit 1
      ) > 0
  `);
  let total = 0;
  for (const { organization_id: organizationId, entitlement_key: key } of candidates.rows) {
    total += await db.transaction(async (tx) => {
      await lockLedger(tx, organizationId, key);
      const state = simulateLots(await loadEntries(tx, organizationId, key));
      return writeExpiries(tx, organizationId, key, dueLots(state, now), "Unused credits expired at the end of their validity.");
    });
  }
  return total;
}

/** Close the open allowance lots a subscription granted (subscription ended, replaced or cancelled). */
export async function expireSubscriptionCredits(tx: DbOrTx, subscriptionId: string, organizationId: string): Promise<number> {
  const keys = await tx
    .selectDistinct({ key: creditLedger.entitlementKey })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.organizationId, organizationId),
        eq(creditLedger.referenceType, "subscription"),
        eq(creditLedger.referenceId, subscriptionId),
        sql`${creditLedger.delta} > 0`,
      ),
    );
  let total = 0;
  for (const { key } of keys) {
    await lockLedger(tx, organizationId, key);
    const state = simulateLots(await loadEntries(tx, organizationId, key));
    total += await writeExpiries(tx, organizationId, key, subscriptionLots(state, subscriptionId), "Plan allowance closed when the subscription ended.");
  }
  return total;
}

/**
 * Staff adjustment (commercial.plans): add or remove credits with a mandatory reason. Removals cannot take the
 * balance below zero.
 */
export async function adjustCredits(
  ctx: StaffContext,
  input: { organizationId: string; entitlementKey: EntitlementKey; delta: number; note: string; expiresAt?: Date | null },
): Promise<LedgerWriteResult> {
  assertStaff(ctx, "commercial.plans");
  const note = input.note.trim();
  if (note.length < 5) throw new ActionError("Give a reason for the adjustment (at least 5 characters).", { fieldErrors: { note: ["A reason is required"] } });
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) throw new ActionError("Enter a non-zero whole number of credits.", { fieldErrors: { delta: ["Enter a whole number"] } });
  if (ENTITLEMENTS[input.entitlementKey].mode !== "credit") {
    throw new ActionError(`${ENTITLEMENTS[input.entitlementKey].label} are counted from live data and cannot be adjusted with credits. Change the plan limits instead.`);
  }
  return db.transaction(async (tx) => {
    const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
    if (!org) throw notFound("Organisation");
    await lockLedger(tx, input.organizationId, input.entitlementKey);
    const head = await ledgerHead(tx, input.organizationId, input.entitlementKey);
    if (input.delta < 0 && head.balance + input.delta < 0) {
      throw new ActionError(`Only ${Math.max(0, head.balance)} credits are available to remove.`, { fieldErrors: { delta: ["More than the balance"] } });
    }
    const result =
      input.delta > 0
        ? await grantCredits(
            {
              organizationId: input.organizationId,
              entitlementKey: input.entitlementKey,
              delta: input.delta,
              reason: "adjustment",
              actorUserId: ctx.user.id,
              note,
              expiresAt: input.expiresAt ?? null,
            },
            tx,
          )
        : await appendLocked(tx, {
            organizationId: input.organizationId,
            entitlementKey: input.entitlementKey,
            delta: input.delta,
            reason: "adjustment",
            actorUserId: ctx.user.id,
            note,
          });
    await audit({
      action: "commercial.credits_adjusted",
      entityType: "organization",
      entityId: input.organizationId,
      organizationId: input.organizationId,
      actorUserId: ctx.user.id,
      actorType: "staff",
      metadata: { entitlementKey: input.entitlementKey, delta: input.delta, balanceAfter: result.balanceAfter, note },
      tx,
    });
    return result;
  });
}
