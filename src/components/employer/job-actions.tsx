"use client";

import { Copy, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions";
import {
  archiveJobAction,
  closeJobAction,
  deleteJobAction,
  duplicateJobAction,
  extendJobAction,
  pauseJobAction,
  reopenJobAction,
  resumeJobAction,
  submitJobAction,
  withdrawJobAction,
} from "@/modules/jobs/actions";
import { canTransition, type JobAction } from "@/modules/jobs/lifecycle";
import type { JobPostingStatus } from "@/db/schema/jobs";

import { closeReasonOptions } from "./labels";

type Dialog = "submit" | "withdraw" | "pause" | "resume" | "close" | "extend" | "reopen" | "archive" | "delete" | "duplicate" | null;

const str = (fd: FormData | undefined, key: string) => {
  const v = fd?.get(key);
  return typeof v === "string" && v ? v : undefined;
};

function DateFields({ idPrefix, required }: { idPrefix: string; required?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-deadline`}>New application deadline{required ? "" : " (optional)"}</Label>
        <Input id={`${idPrefix}-deadline`} name="applicationDeadline" type="date" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-expires`}>New listing end date (optional)</Label>
        <Input id={`${idPrefix}-expires`} name="expiresAt" type="date" />
      </div>
    </div>
  );
}

/**
 * Lifecycle controls for one job (detail page). Shows only actions the job's status allows; the
 * jobs module re-checks permission, status and the verification / entitlement gates.
 */
export function JobActions({
  jobId,
  title,
  status,
  submitBlockedReason,
  compact = false,
}: {
  jobId: string;
  title: string;
  status: JobPostingStatus;
  /** Why the job cannot be sent for review now (verification, plan limit), or null. */
  submitBlockedReason: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const can = (a: JobAction) => canTransition(a, status);
  const controlled = (d: Exclude<Dialog, null>) => ({ open: dialog === d, onOpenChange: (o: boolean) => setDialog(o ? d : null) });

  const primary: { dialog: Exclude<Dialog, null>; label: string } | null = can("submit")
    ? { dialog: "submit", label: "Submit for review" }
    : can("resume")
      ? { dialog: "resume", label: "Resume job" }
      : can("reopen")
        ? { dialog: "reopen", label: "Reopen job" }
        : null;

  const menu: { dialog: Exclude<Dialog, null>; label: string; destructive?: boolean }[] = [];
  if (can("withdraw")) menu.push({ dialog: "withdraw", label: "Withdraw from review" });
  if (can("pause")) menu.push({ dialog: "pause", label: "Pause" });
  if (can("extend")) menu.push({ dialog: "extend", label: "Extend dates" });
  if (can("close")) menu.push({ dialog: "close", label: "Close job" });
  menu.push({ dialog: "duplicate", label: "Duplicate" });
  if (can("archive")) menu.push({ dialog: "archive", label: "Archive" });
  if (can("delete")) menu.push({ dialog: "delete", label: "Delete", destructive: true });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary ? (
        <Button
          onClick={() => setDialog(primary.dialog)}
          disabled={primary.dialog === "submit" && Boolean(submitBlockedReason)}
          aria-describedby={primary.dialog === "submit" && submitBlockedReason ? `submit-blocked-${jobId}` : undefined}
        >
          {primary.label}
        </Button>
      ) : null}
      {!compact && can("pause") ? (
        <Button variant="outline" onClick={() => setDialog("pause")}>
          Pause
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={compact ? "icon" : "default"} aria-label={`More actions for ${title}`}>
            <MoreHorizontal aria-hidden="true" />
            {compact ? null : <span>More</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {menu.map((item, i) => (
            <span key={item.dialog}>
              {item.destructive && i > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem variant={item.destructive ? "destructive" : "default"} onSelect={() => setDialog(item.dialog)}>
                {item.dialog === "duplicate" ? <Copy aria-hidden="true" /> : null}
                {item.label}
              </DropdownMenuItem>
            </span>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {primary?.dialog === "submit" && submitBlockedReason ? (
        <p id={`submit-blocked-${jobId}`} className="w-full text-sm text-muted-foreground">
          {submitBlockedReason}
        </p>
      ) : null}

      <ConfirmDialog
        {...controlled("submit")}
        title="Submit this job for review?"
        description="Venkat Sai checks the job before it is published. You will be notified of the decision."
        confirmLabel="Submit for review"
        onConfirm={() => submitJobAction({ id: jobId, portal: "employer" })}
      />
      <ConfirmDialog
        {...controlled("withdraw")}
        title="Withdraw from review?"
        description="The job returns to draft. You can edit it and submit again."
        confirmLabel="Withdraw"
        onConfirm={() => withdrawJobAction({ id: jobId, portal: "employer" })}
      />
      <ConfirmDialog
        {...controlled("pause")}
        title="Pause this job?"
        description="It is hidden from search and candidates cannot apply until you resume it. Existing applications are kept."
        confirmLabel="Pause job"
        onConfirm={() => pauseJobAction({ id: jobId, portal: "employer" })}
      />
      <ConfirmDialog
        {...controlled("resume")}
        title="Resume this job?"
        description="It becomes visible again. A job past its deadline needs new dates first (use Extend dates)."
        confirmLabel="Resume job"
        onConfirm={() => resumeJobAction({ id: jobId, portal: "employer" })}
      />
      <ConfirmDialog
        {...controlled("close")}
        title="Close this job?"
        description="Candidates can no longer apply. Applications in progress stay in your pipeline."
        confirmLabel="Close job"
        variant="destructive"
        onConfirm={(fd?: FormData) => {
          const reason = str(fd, "reason");
          if (!reason) return Promise.resolve<ActionResult>({ ok: false, error: "Choose why you are closing the job." });
          return closeJobAction({ id: jobId, portal: "employer", reason: reason as (typeof closeReasonOptions)[number]["value"] });
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Reason</legend>
          {closeReasonOptions.map((o) => (
            <div key={o.value} className="flex items-center gap-2">
              <input
                id={`close-${jobId}-${o.value}`}
                type="radio"
                name="reason"
                value={o.value}
                defaultChecked={o.value === "filled"}
                className="size-4 accent-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <Label htmlFor={`close-${jobId}-${o.value}`} className="font-normal">
                {o.label}
              </Label>
            </div>
          ))}
        </fieldset>
      </ConfirmDialog>
      <ConfirmDialog
        {...controlled("extend")}
        title="Extend dates"
        description="Choose later dates (up to 180 days ahead). A job that closed because it expired is reopened."
        confirmLabel="Update dates"
        onConfirm={(fd?: FormData) => extendJobAction({ id: jobId, portal: "employer", applicationDeadline: str(fd, "applicationDeadline"), expiresAt: str(fd, "expiresAt") })}
      >
        <DateFields idPrefix={`extend-${jobId}`} />
      </ConfirmDialog>
      <ConfirmDialog
        {...controlled("reopen")}
        title="Reopen this job?"
        description="It is published again. If its dates have passed, choose new ones."
        confirmLabel="Reopen job"
        onConfirm={(fd?: FormData) => reopenJobAction({ id: jobId, portal: "employer", applicationDeadline: str(fd, "applicationDeadline"), expiresAt: str(fd, "expiresAt") })}
      >
        <DateFields idPrefix={`reopen-${jobId}`} />
      </ConfirmDialog>
      <ConfirmDialog
        {...controlled("archive")}
        title="Archive this job?"
        description="It moves to Archived and is kept for your records."
        confirmLabel="Archive"
        onConfirm={() => archiveJobAction({ id: jobId, portal: "employer" })}
      />
      <ConfirmDialog
        {...controlled("delete")}
        title="Delete this job?"
        description="It is removed from your jobs list. This cannot be undone from the portal."
        confirmLabel="Delete job"
        variant="destructive"
        onConfirm={async () => {
          const result = await deleteJobAction({ id: jobId, portal: "employer" });
          if (result.ok) router.push("/employer/jobs");
          return result;
        }}
      />
      <ConfirmDialog
        {...controlled("duplicate")}
        title="Duplicate this job?"
        description="A new draft is created with the same details, skills and questions. Review it before submitting."
        confirmLabel="Create copy"
        onConfirm={async () => {
          const result = await duplicateJobAction({ id: jobId, portal: "employer" });
          if (result.ok && result.data?.id) router.push(`/employer/jobs/${result.data.id}/edit`);
          return result;
        }}
      />
    </div>
  );
}
