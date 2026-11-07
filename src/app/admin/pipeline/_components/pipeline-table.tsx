"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { SimpleSelect } from "@/components/shared/selects";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions";
import type { BulkResult } from "@/modules/recruitment/types";

import { humanize, statusTone } from "../_shared/status";

export type PipelineRow = {
  id: string;
  code: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  jobCode: string;
  employer: string;
  stageName: string;
  stageCategory: string;
  source: string;
  partnerName: string | null;
  ownerName: string | null;
  flags: number;
  shared: boolean;
  managed: boolean;
  updated: string;
};

type BulkMove = (input: { applicationIds: string[]; toStageKey: string; rejectionReasonCode?: string | null; candidateVisibleNote?: string }) => Promise<ActionResult<BulkResult[]>>;
type BulkShare = (input: { applicationIds: string[] }) => Promise<ActionResult<BulkResult[]>>;

/**
 * Cross-job application table with selection and bulk actions (move stage, share with employer).
 * Stacks into cards on phones. Moves are independent: the server reports each result and the
 * transition matrix is enforced there.
 */
export function PipelineTable({
  rows,
  stageOptions,
  rejectionOptions,
  canManage,
  moveAction,
  shareAction,
}: {
  rows: PipelineRow[];
  stageOptions: SelectOption[];
  rejectionOptions: SelectOption[];
  canManage: boolean;
  moveAction: BulkMove;
  shareAction: BulkShare;
}) {
  const router = useRouter();
  const id = useId();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [pending, start] = useTransition();
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const ids = useMemo(() => rows.filter((r) => selected.has(r.id)).map((r) => r.id), [rows, selected]);
  const isReject = stage === "rejected";

  function toggle(rowId: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  }

  function report(result: ActionResult<BulkResult[]>) {
    if (!result.ok) {
      toast.error(result.error);
      setStatus(result.error);
      return;
    }
    const failures = (result.data ?? []).filter((r): r is Extract<BulkResult, { ok: false }> => !r.ok);
    const text = failures.length ? `${result.message ?? "Done."} First problem: ${failures[0]?.error}` : (result.message ?? "Done.");
    if (failures.length) toast.warning(text);
    else toast.success(text);
    setStatus(text);
    setSelected(new Set());
    router.refresh();
  }

  function runMove() {
    if (!stage || !ids.length || pending) return;
    if (isReject && !reason) {
      setStatus("Choose a rejection reason.");
      return;
    }
    start(async () => report(await moveAction({ applicationIds: ids, toStageKey: stage, rejectionReasonCode: isReject ? reason : null, candidateVisibleNote: message || undefined })));
  }

  function runShare() {
    if (!ids.length || pending) return;
    start(async () => report(await shareAction({ applicationIds: ids })));
  }

  return (
    <div className="space-y-3">
      {canManage ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 lg:flex-row lg:flex-wrap lg:items-end" role="region" aria-label="Bulk actions">
          <p className="text-sm font-medium lg:mr-2 lg:self-center" aria-live="polite">
            {ids.length ? `${ids.length} selected` : "Select applications to act on them"}
          </p>
          <div className="grid gap-1.5 lg:w-56">
            <Label htmlFor={`${id}-stage`}>Move to stage</Label>
            <SimpleSelect id={`${id}-stage`} name="toStageKey" options={stageOptions} value={stage} onValueChange={setStage} placeholder="Choose a stage" />
          </div>
          {isReject ? (
            <div className="grid gap-1.5 lg:w-64">
              <Label htmlFor={`${id}-reason`}>Rejection reason</Label>
              <SimpleSelect id={`${id}-reason`} name="rejectionReasonCode" options={rejectionOptions} value={reason} onValueChange={setReason} placeholder="Choose a reason" />
            </div>
          ) : null}
          <div className="grid gap-1.5 lg:w-72">
            <Label htmlFor={`${id}-msg`}>
              Message to candidates <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id={`${id}-msg`} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={runMove} aria-disabled={!ids.length || !stage || pending || undefined} data-testid="bulk-move">
              {pending ? "Working…" : "Move"}
            </Button>
            <Button type="button" variant="outline" onClick={runShare} aria-disabled={!ids.length || pending || undefined}>
              Share with employer
            </Button>
          </div>
          <p className="sr-only" aria-live="polite">
            {status}
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="hidden w-full text-sm md:table">
          <caption className="sr-only">Applications across jobs</caption>
          <thead className="bg-surface-subtle text-left text-xs text-muted-foreground">
            <tr>
              {canManage ? (
                <th scope="col" className="w-10 p-3">
                  <Checkbox aria-label="Select all applications on this page" checked={allSelected} onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())} />
                </th>
              ) : null}
              <th scope="col" className="p-3 font-medium">Candidate</th>
              <th scope="col" className="p-3 font-medium">Job</th>
              <th scope="col" className="p-3 font-medium">Stage</th>
              <th scope="col" className="p-3 font-medium">Source</th>
              <th scope="col" className="p-3 font-medium">Owner</th>
              <th scope="col" className="p-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="align-top hover:bg-surface-subtle/60">
                {canManage ? (
                  <td className="p-3">
                    <Checkbox aria-label={`Select ${r.candidateName} for ${r.jobTitle}`} checked={selected.has(r.id)} onCheckedChange={(v) => toggle(r.id, v === true)} />
                  </td>
                ) : null}
                <td className="p-3">
                  <Link href={`/admin/pipeline/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                    {r.candidateName}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{r.code}</p>
                  {r.flags ? <p className="text-xs text-warning-strong">{r.flags} screening flag{r.flags === 1 ? "" : "s"}</p> : null}
                </td>
                <td className="p-3">
                  <p>{r.jobTitle}</p>
                  <p className="text-xs text-muted-foreground">{r.employer}</p>
                </td>
                <td className="p-3">
                  <StatusBadge tone={statusTone(r.stageCategory)} size="sm">{r.stageName}</StatusBadge>
                  {r.managed && !r.shared ? <p className="mt-1 text-xs text-muted-foreground">Not shared with employer</p> : null}
                </td>
                <td className="p-3">
                  {humanize(r.source)}
                  {r.partnerName ? <p className="text-xs text-muted-foreground">{r.partnerName}</p> : null}
                </td>
                <td className="p-3">{r.ownerName ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                <td className="p-3 text-muted-foreground">{r.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y divide-border md:hidden" aria-label="Applications across jobs">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-3 p-3">
              {canManage ? <Checkbox className="mt-1" aria-label={`Select ${r.candidateName} for ${r.jobTitle}`} checked={selected.has(r.id)} onCheckedChange={(v) => toggle(r.id, v === true)} /> : null}
              <div className="min-w-0 flex-1 space-y-1">
                <Link href={`/admin/pipeline/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                  {r.candidateName}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {r.jobTitle} · {r.employer}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={statusTone(r.stageCategory)} size="sm">{r.stageName}</StatusBadge>
                  <span className="text-xs text-muted-foreground">{humanize(r.source)}{r.partnerName ? ` · ${r.partnerName}` : ""}</span>
                </div>
                <p className="text-xs text-muted-foreground">Updated {r.updated}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
