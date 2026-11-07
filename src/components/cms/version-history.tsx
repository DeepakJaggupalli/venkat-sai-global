"use client";

import { GitCompare, History, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { RelativeTime } from "@/components/shared/relative-time";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { compareVersionsAction } from "@/app/admin/content/_lib/actions";
import { rollbackEntryAction } from "@/modules/content/actions";
import type { EntryVersionDiff } from "@/modules/content/types";

import { describeValue } from "./field-utils";
import type { EditorVersion } from "./types";

const KIND_LABEL = { added: "Added", removed: "Removed", changed: "Changed" } as const;

/** Version list with a readable field-by-field comparison and rollback (restores as a new version). */
export function VersionHistory({ entryId, versions, canRollback, approvalCollection }: { entryId: string; versions: EditorVersion[]; canRollback: boolean; approvalCollection: boolean }) {
  const router = useRouter();
  const [diff, setDiff] = useState<EntryVersionDiff | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = versions.find((v) => v.isCurrent)?.version ?? versions[0]?.version ?? 1;
  const shown = showAll ? versions : versions.slice(0, 8);

  function compare(from: number, to: number) {
    setOpen(true);
    setDiff(null);
    setDiffError(null);
    startTransition(async () => {
      const result = await compareVersionsAction({ id: entryId, from, to });
      if (result.ok && result.data) setDiff(result.data);
      else setDiffError(result.ok ? "The versions could not be compared." : result.error);
    });
  }

  if (versions.length === 0) return <p className="text-sm text-muted-foreground">No versions saved yet.</p>;

  return (
    <div className="space-y-3">
      <ol className="divide-y rounded-lg border" aria-label="Saved versions, newest first">
        {shown.map((v) => (
          <li key={v.version} className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-heading text-sm font-semibold">Version {v.version}</span>
              {v.isCurrent && <StatusBadge tone="info" size="sm">Latest</StatusBadge>}
              {v.isPublished && <StatusBadge tone="success" size="sm">Live</StatusBadge>}
              {v.isScheduled && <StatusBadge tone="brand" size="sm">Scheduled</StatusBadge>}
            </div>
            <p className="text-xs text-muted-foreground">
              <RelativeTime value={v.createdAt} />
              {v.createdByName ? ` · ${v.createdByName}` : ""}
            </p>
            {v.note && <p className="text-sm">{v.note}</p>}
            <div className="flex flex-wrap gap-1">
              {!v.isCurrent && (
                <Button type="button" variant="ghost" size="sm" onClick={() => compare(v.version, current)}>
                  <GitCompare aria-hidden />
                  Compare with latest<span className="sr-only"> (version {v.version} to {current})</span>
                </Button>
              )}
              {v.isCurrent && v.version > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => compare(v.version - 1, v.version)}>
                  <GitCompare aria-hidden />
                  What changed<span className="sr-only"> in version {v.version}</span>
                </Button>
              )}
              {canRollback && !v.isCurrent && <RollbackButton entryId={entryId} version={v.version} approvalCollection={approvalCollection} onDone={() => router.refresh()} />}
            </div>
          </li>
        ))}
      </ol>
      {versions.length > 8 && (
        <Button type="button" variant="link" size="sm" onClick={() => setShowAll((s) => !s)}>
          <History aria-hidden />
          {showAll ? "Show fewer versions" : `Show all ${versions.length} versions`}
        </Button>
      )}

      <ResponsiveDialog open={open} onOpenChange={setOpen} title={diff ? `Changes from version ${diff.from} to ${diff.to}` : "Comparing versions"} size="lg">
        <div aria-live="polite" aria-busy={pending}>
          {pending && <p className="text-sm text-muted-foreground">Comparing…</p>}
          {diffError && <p className="text-sm text-danger-strong">{diffError}</p>}
          {diff && diff.changes.length === 0 && <p className="text-sm text-muted-foreground">These versions have identical content.</p>}
          {diff && diff.changes.length > 0 && (
            <ul className="space-y-3">
              {diff.changes.map((c) => (
                <li key={c.path} className="rounded-lg border p-3">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {c.label}
                    <StatusBadge tone={c.kind === "added" ? "success" : c.kind === "removed" ? "danger" : "info"} size="sm">
                      {KIND_LABEL[c.kind]}
                    </StatusBadge>
                  </p>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-md bg-danger-soft/60 p-2">
                      <dt className="text-xs font-medium text-danger-strong">Before (version {diff.from})</dt>
                      <dd className="mt-1 break-words">{describeValue(c.before)}</dd>
                    </div>
                    <div className="rounded-md bg-success-soft/60 p-2">
                      <dt className="text-xs font-medium text-success-strong">After (version {diff.to})</dt>
                      <dd className="mt-1 break-words">{describeValue(c.after)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ResponsiveDialog>
    </div>
  );
}

function RollbackButton({ entryId, version, approvalCollection, onDone }: { entryId: string; version: number; approvalCollection: boolean; onDone: () => void }) {
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          <RotateCcw aria-hidden />
          Restore<span className="sr-only"> version {version}</span>
        </Button>
      }
      title={`Restore version ${version}?`}
      description="Its content is copied into a new version. Nothing is lost: the current version stays in the history."
      confirmLabel="Restore"
      onConfirm={(fd) => rollbackEntryAction({ id: entryId, version, publish: fd.get("publish") === "on" })}
      onSuccess={onDone}
    >
      <div className="flex items-start gap-2">
        <Checkbox id={`rb-publish-${version}`} name="publish" />
        <Label htmlFor={`rb-publish-${version}`} className="font-normal leading-snug">
          {approvalCollection ? "Send the restored version for approval to publish" : "Publish the restored version immediately"}
        </Label>
      </div>
    </ConfirmDialog>
  );
}
