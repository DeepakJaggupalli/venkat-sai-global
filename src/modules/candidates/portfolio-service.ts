import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/db";
import { candidatePortfolioItems } from "@/db/schema";
import { ActionError } from "@/lib/actions";
import { audit } from "@/modules/audit";

import { auditContext, lockCandidateTarget, type CandidateTarget } from "./actor";
import { CANDIDATE_LIMITS } from "./constants";
import { refreshCandidateDerived } from "./derived";
import { revokeProfileGrantsForFiles } from "./file-grants";
import type { PortfolioItemInput } from "./schemas";
import type { CandidateActor, CandidatePortfolioItemRow } from "./types";
import { acceptCandidateUpload } from "./uploads";

/**
 * Portfolio (work samples: weld photos, project videos). Public items are shown wherever the
 * profile itself is visible; private items only to the candidate and staff. Making an item private
 * or removing media revokes organisations' access to those files immediately.
 */

async function loadItem(target: CandidateTarget, id: string, tx: DbOrTx): Promise<CandidatePortfolioItemRow> {
  const [row] = await tx
    .select()
    .from(candidatePortfolioItems)
    .where(and(eq(candidatePortfolioItems.id, id), eq(candidatePortfolioItems.candidateId, target.candidateId), isNull(candidatePortfolioItems.deletedAt)))
    .limit(1);
  if (!row) throw new ActionError("This portfolio item could not be found on your profile.", { code: "not_found" });
  return row;
}

/** Add (no id) or update (id) a portfolio item. */
export async function savePortfolioItem(actor: CandidateActor, input: PortfolioItemInput): Promise<CandidatePortfolioItemRow> {
  return db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const existing = input.id ? await loadItem(target, input.id, tx) : null;
    const previousMedia = new Set(existing?.mediaFileIds ?? []);
    for (const fileId of input.mediaFileIds) {
      if (!previousMedia.has(fileId)) await acceptCandidateUpload(target, fileId, ["portfolio_media"], tx);
    }
    const values = {
      title: input.title,
      description: input.description ?? null,
      projectDate: input.projectDate ?? null,
      location: input.location ?? null,
      mediaFileIds: input.mediaFileIds,
      videoUrl: input.videoUrl ?? null,
      tags: input.tags,
      isPublic: input.isPublic,
    };
    let row: CandidatePortfolioItemRow;
    if (existing) {
      [row] = (await tx.update(candidatePortfolioItems).set(values).where(eq(candidatePortfolioItems.id, existing.id)).returning()) as [CandidatePortfolioItemRow];
      const removedMedia = existing.mediaFileIds.filter((id) => !input.mediaFileIds.includes(id));
      const nowPrivate = existing.isPublic && !input.isPublic ? input.mediaFileIds : [];
      await revokeProfileGrantsForFiles([...removedMedia, ...nowPrivate], target.actorUserId, tx);
    } else {
      const [count] = await tx
        .select({ value: sql<number>`count(*)::int`, maxOrder: sql<number>`coalesce(max(${candidatePortfolioItems.sortOrder}), -1)::int` })
        .from(candidatePortfolioItems)
        .where(and(eq(candidatePortfolioItems.candidateId, target.candidateId), isNull(candidatePortfolioItems.deletedAt)));
      if (Number(count?.value ?? 0) >= CANDIDATE_LIMITS.portfolioItems) throw new ActionError(`You can add up to ${CANDIDATE_LIMITS.portfolioItems} portfolio items.`);
      [row] = (await tx
        .insert(candidatePortfolioItems)
        .values({ ...values, candidateId: target.candidateId, sortOrder: Number(count?.maxOrder ?? -1) + 1 })
        .returning()) as [CandidatePortfolioItemRow];
    }
    if (target.onBehalf) {
      await audit({ action: existing ? "candidate.portfolio_updated" : "candidate.portfolio_added", entityType: "candidate_portfolio_item", entityId: row.id, metadata: { candidateId: target.candidateId, onBehalf: true }, ...auditContext(target), tx });
    }
    await refreshCandidateDerived(target.candidateId, tx);
    return row;
  });
}

/** Soft-delete a portfolio item and revoke organisations' access to its media. */
export async function deletePortfolioItem(actor: CandidateActor, itemId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const existing = await loadItem(target, itemId, tx);
    await tx.update(candidatePortfolioItems).set({ deletedAt: new Date() }).where(eq(candidatePortfolioItems.id, existing.id));
    await revokeProfileGrantsForFiles(existing.mediaFileIds, target.actorUserId, tx);
    if (target.onBehalf) {
      await audit({ action: "candidate.portfolio_deleted", entityType: "candidate_portfolio_item", entityId: existing.id, metadata: { candidateId: target.candidateId, onBehalf: true }, ...auditContext(target), tx });
    }
    await refreshCandidateDerived(target.candidateId, tx);
  });
}

/** Set the display order of the portfolio (ids of every current item, in order). */
export async function reorderPortfolio(actor: CandidateActor, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    const target = await lockCandidateTarget(actor, tx);
    const rows = await tx
      .select({ id: candidatePortfolioItems.id })
      .from(candidatePortfolioItems)
      .where(and(eq(candidatePortfolioItems.candidateId, target.candidateId), isNull(candidatePortfolioItems.deletedAt)))
      .orderBy(asc(candidatePortfolioItems.sortOrder));
    const owned = new Set(rows.map((r) => r.id));
    if (orderedIds.length !== owned.size || orderedIds.some((id) => !owned.has(id))) {
      throw new ActionError("The list changed while you were editing. Reload the page and try again.");
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx.update(candidatePortfolioItems).set({ sortOrder: index }).where(eq(candidatePortfolioItems.id, id));
    }
  });
}
