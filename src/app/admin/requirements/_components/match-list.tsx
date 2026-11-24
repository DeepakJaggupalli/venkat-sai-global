"use client";

import { Copy, Eye, MessageCircle, UserCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { RelativeTime } from "@/components/shared/relative-time";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { CvSubmissionStatus } from "@/db/schema/cv-submissions";
import { CV_SUBMISSION_STATUS_LABELS, CV_SUBMISSION_STATUS_TONE } from "@/modules/operations/cv-submission-schemas";

import { copyMatchNumbersAction, markMatchesContactedAction, revealMatchPhoneAction } from "../match-actions";

export type MatchRow = {
  kind: "cv" | "profile";
  id: string;
  code: string | null;
  name: string;
  trade: string;
  experienceYears: number | null;
  countryName: string | null;
  prefersTargetCountry: boolean;
  status: CvSubmissionStatus | null;
  /** CVs: a CV file is attached; null for candidate profiles. */
  hasCv: boolean | null;
  phoneMasked: string;
  hasPhone: boolean;
  createdAt: string;
  reason: string;
};

type Props = {
  target: { kind: "poster" | "requirement"; id: string };
  rows: MatchRow[];
  canContact: boolean;
  canManage: boolean;
};

const key = (r: Pick<MatchRow, "kind" | "id">) => `${r.kind}:${r.id}`;

/**
 * Matched people with selection, "Mark selected as contacted" (CVs) and "Copy numbers" (logged). Numbers stay masked
 * until revealed; WhatsApp opens through a logged redirect (/admin/requirements/match-whatsapp).
 */
export function MatchList({ target, rows, canContact, canManage }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const selectable = canContact || canManage;
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(key(r))), [rows, selected]);
  const selectedCvs = selectedRows.filter((r) => r.kind === "cv");
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(r: MatchRow, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key(r));
      else next.delete(key(r));
      return next;
    });
  }

  function markContacted() {
    startTransition(async () => {
      const res = await markMatchesContactedAction({ target, ids: selectedCvs.map((r) => r.id) });
      if (res.ok) {
        toast.success(res.message ?? "Updated.");
        setSelected(new Set());
      } else toast.error(res.error);
    });
  }

  function copyNumbers() {
    startTransition(async () => {
      const res = await copyMatchNumbersAction({ target, people: selectedRows.map((r) => ({ kind: r.kind, id: r.id })) });
      if (!res.ok) return void toast.error(res.error);
      const phones = res.data?.phones ?? [];
      if (!phones.length) return void toast.error("None of the selected people has a phone number.");
      try {
        await navigator.clipboard.writeText(phones.join("\n"));
        toast.success(`${phones.length} ${phones.length === 1 ? "number" : "numbers"} copied.`);
      } catch {
        toast.error("Your browser blocked copying. Reveal the numbers one by one instead.");
      }
    });
  }

  function reveal(r: MatchRow) {
    startTransition(async () => {
      const res = await revealMatchPhoneAction({ target, person: { kind: r.kind, id: r.id } });
      if (res.ok && res.data?.phone) setRevealed((prev) => ({ ...prev, [key(r)]: res.data!.phone! }));
      else toast.error(res.ok ? "No phone number on record." : res.error);
    });
  }

  return (
    <div className="space-y-3">
      {selectable ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-subtle p-3" role="toolbar" aria-label="Bulk actions">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {selected.size ? `${selected.size} selected` : "Select people to act on them together"}
          </span>
          <div className="ms-auto flex flex-wrap gap-2">
            {canManage ? (
              <Button size="sm" variant="outline" disabled={pending || !selectedCvs.length} onClick={markContacted} data-testid="match-mark-contacted">
                <UserCheck aria-hidden="true" />
                Mark selected as contacted
              </Button>
            ) : null}
            {canContact ? (
              <Button size="sm" variant="outline" disabled={pending || !selectedRows.length} onClick={copyNumbers} data-testid="match-copy-numbers">
                <Copy aria-hidden="true" />
                Copy numbers
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">Matching people, best match first</caption>
          <thead className="bg-surface-subtle text-left text-xs text-muted-foreground">
            <tr>
              {selectable ? (
                <th scope="col" className="w-10 p-3">
                  <Checkbox
                    aria-label="Select all"
                    checked={allSelected ? true : selected.size ? "indeterminate" : false}
                    onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map(key)) : new Set())}
                  />
                </th>
              ) : null}
              <th scope="col" className="p-3 font-medium">Name</th>
              <th scope="col" className="p-3 font-medium">Trade</th>
              <th scope="col" className="p-3 font-medium">Experience</th>
              <th scope="col" className="p-3 font-medium">Country preference</th>
              <th scope="col" className="p-3 font-medium">Status</th>
              <th scope="col" className="p-3 font-medium">Phone</th>
              <th scope="col" className="p-3 font-medium">Why it matches</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const k = key(r);
              const phone = revealed[k];
              return (
                <tr key={k} className="align-top">
                  {selectable ? (
                    <td className="p-3">
                      <Checkbox aria-label={`Select ${r.name}`} checked={selected.has(k)} onCheckedChange={(v) => toggle(r, v === true)} />
                    </td>
                  ) : null}
                  <td className="p-3">
                    {r.kind === "cv" ? (
                      <Link href={`/admin/cv-submissions/${r.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                        {r.name}
                      </Link>
                    ) : (
                      <Link href={`/admin/candidates/${r.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                        {r.name}
                      </Link>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {r.kind === "cv" ? `CV ${r.code ?? ""}` : "Candidate profile"} · <RelativeTime value={r.createdAt} />
                      {r.hasCv === false ? " · No CV file yet" : ""}
                    </p>
                  </td>
                  <td className="p-3">{r.trade}</td>
                  <td className="p-3 whitespace-nowrap">{r.experienceYears == null ? <span className="text-muted-foreground">Not given</span> : `${r.experienceYears} yrs`}</td>
                  <td className="p-3">
                    {r.countryName ?? <span className="text-muted-foreground">Any</span>}
                    {r.prefersTargetCountry ? <span className="sr-only"> (destination country)</span> : null}
                  </td>
                  <td className="p-3">
                    {r.status ? (
                      <StatusBadge tone={CV_SUBMISSION_STATUS_TONE[r.status] ?? "neutral"} size="sm">
                        {CV_SUBMISSION_STATUS_LABELS[r.status] ?? r.status}
                      </StatusBadge>
                    ) : (
                      <span className="text-muted-foreground">Profile</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs whitespace-nowrap">{phone ?? r.phoneMasked}</span>
                      {canContact && r.hasPhone ? (
                        <>
                          {!phone ? (
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => reveal(r)} aria-label={`Show number of ${r.name}`}>
                              <Eye aria-hidden="true" />
                              Show
                            </Button>
                          ) : null}
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={`/admin/requirements/match-whatsapp?target=${target.kind}:${target.id}&person=${k}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`WhatsApp ${r.name} (opens WhatsApp)`}
                            >
                              <MessageCircle aria-hidden="true" />
                              WhatsApp
                            </a>
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{r.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
