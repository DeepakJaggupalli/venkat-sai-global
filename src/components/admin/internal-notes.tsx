import { Pin } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import type { StaffContext } from "@/modules/identity/authz";
import { listInternalNotes } from "@/modules/operations/queries";
import type { NoteEntityType } from "@/modules/operations/constants";

import { NoteComposer, NoteRowActions } from "./internal-notes-client";

/**
 * Staff-only internal notes for any record (operations module). Notes are never shown to candidates,
 * employers or partners: this panel only renders inside the Command Centre and asks for staff visibility.
 */
export async function InternalNotesPanel({
  ctx,
  entityType,
  entityId,
  organizationId,
  title = "Internal notes",
}: {
  ctx: StaffContext;
  entityType: NoteEntityType;
  entityId: string;
  organizationId?: string | null;
  title?: string;
}) {
  let notes: Awaited<ReturnType<typeof listInternalNotes>> = [];
  let unavailable = false;
  try {
    notes = (await listInternalNotes({ kind: "staff", ctx }, entityType, entityId)).filter((n) => n.visibility === "staff");
  } catch {
    unavailable = true;
  }
  return (
    <SectionCard title={title} description="Visible to Venkat Sai staff only.">
      {unavailable ? (
        <p className="text-sm text-muted-foreground">You do not have access to notes on this record.</p>
      ) : (
        <div className="space-y-4">
          {notes.length ? (
            <ul className="space-y-3" aria-label={title}>
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg border border-border bg-surface-subtle/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {n.pinned ? <Pin aria-label="Pinned" className="size-3.5 text-gold-strong" /> : null}
                      <span className="font-medium text-foreground">{n.authorName ?? "Former staff member"}</span>
                      <span aria-hidden="true">·</span>
                      <RelativeTime value={n.createdAt} />
                    </span>
                    {n.isOwn ? <NoteRowActions id={n.id} pinned={n.pinned} /> : null}
                  </div>
                  <p className="mt-1.5 text-sm whitespace-pre-line text-foreground">{n.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState size="sm" variant="plain" title="No notes yet" description="Add context for the team: calls, decisions, next steps." />
          )}
          <NoteComposer entityType={entityType} entityId={entityId} organizationId={organizationId ?? null} />
        </div>
      )}
    </SectionCard>
  );
}
