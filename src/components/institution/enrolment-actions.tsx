"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { completeEnrolmentAction, confirmEnrolmentAction, decideEnrolmentAction, updateEnrolmentFeeAction, waitlistEnrolmentAction } from "@/modules/training/actions";

import { FEE_STATUS_LABELS } from "./labels";

export type EnrolmentActionTarget = { id: string; status: string; candidateName: string; feeStatus: string };

type Dialog = "confirm" | "waitlist" | "reject" | "cancel" | "drop" | "complete" | "fee" | null;

const REASONED: Record<"reject" | "cancel" | "drop", { title: string; description: string; confirm: string }> = {
  reject: { title: "Decline this application?", description: "The learner is told the application was not accepted, with your reason.", confirm: "Decline application" },
  cancel: { title: "Cancel this enrolment?", description: "The seat is released and the learner is notified with your reason.", confirm: "Cancel enrolment" },
  drop: { title: "Mark as dropped out?", description: "Use this when a learner stops attending. The learner is notified with your reason.", confirm: "Mark as dropped out" },
};

/**
 * Per-enrolment decisions for institution staff: confirm, waitlist, decline, cancel, drop, complete and
 * offline fee status. Reasons are shown to the learner (never write internal notes here).
 */
export function EnrolmentActions({ enrolment }: { enrolment: EnrolmentActionTarget }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const s = enrolment.status;
  const done = (result: { ok: boolean }) => {
    if (result.ok) router.refresh();
    return result;
  };
  const openChange = (kind: Dialog) => (open: boolean) => setDialog(open ? kind : null);

  const items: { kind: Exclude<Dialog, null>; label: string; show: boolean; destructive?: boolean }[] = [
    { kind: "confirm", label: "Confirm place", show: s === "applied" || s === "waitlisted" },
    { kind: "waitlist", label: "Move to waitlist", show: s === "applied" },
    { kind: "complete", label: "Mark completed", show: s === "in_progress" || s === "confirmed" },
    { kind: "fee", label: "Update fee status", show: enrolment.feeStatus !== "not_applicable" && !["rejected", "cancelled"].includes(s) },
    { kind: "reject", label: "Decline application", show: s === "applied" || s === "waitlisted", destructive: true },
    { kind: "cancel", label: "Cancel enrolment", show: s === "confirmed", destructive: true },
    { kind: "drop", label: "Mark dropped out", show: s === "in_progress", destructive: true },
  ];
  const visible = items.filter((i) => i.show);
  if (!visible.length) return null;
  const primary = visible.filter((i) => !i.destructive);
  const destructive = visible.filter((i) => i.destructive);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label={`Actions for ${enrolment.candidateName}`}>
            <MoreHorizontal aria-hidden="true" />
            <span className="sm:sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {primary.map((i) => (
            <DropdownMenuItem key={i.kind} onSelect={() => setDialog(i.kind)}>
              {i.label}
            </DropdownMenuItem>
          ))}
          {primary.length && destructive.length ? <DropdownMenuSeparator /> : null}
          {destructive.map((i) => (
            <DropdownMenuItem key={i.kind} variant="destructive" onSelect={() => setDialog(i.kind)}>
              {i.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={dialog === "confirm"}
        onOpenChange={openChange("confirm")}
        title={`Confirm ${enrolment.candidateName}'s place?`}
        description="A seat is taken and the learner is notified. If the batch is full, confirm fails and the learner stays where they are."
        confirmLabel="Confirm place"
        onConfirm={async () => done(await confirmEnrolmentAction({ via: "institution", enrolmentId: enrolment.id }))}
      />
      <ConfirmDialog
        open={dialog === "waitlist"}
        onOpenChange={openChange("waitlist")}
        title={`Move ${enrolment.candidateName} to the waitlist?`}
        description="The learner is notified. You can confirm them later when a seat is free."
        confirmLabel="Move to waitlist"
        onConfirm={async (fd) => done(await waitlistEnrolmentAction({ via: "institution", enrolmentId: enrolment.id, reason: String(fd.get("reason") ?? "") || undefined }))}
      >
        <div className="space-y-2">
          <Label htmlFor={`wl-${enrolment.id}`}>Note to the learner (optional)</Label>
          <Textarea id={`wl-${enrolment.id}`} name="reason" rows={2} maxLength={500} />
        </div>
      </ConfirmDialog>
      {(["reject", "cancel", "drop"] as const).map((kind) => (
        <ConfirmDialog
          key={kind}
          open={dialog === kind}
          onOpenChange={openChange(kind)}
          title={REASONED[kind].title}
          description={REASONED[kind].description}
          confirmLabel={REASONED[kind].confirm}
          variant="destructive"
          onConfirm={async (fd) => {
            fd.set("enrolmentId", enrolment.id);
            fd.set("decision", kind);
            fd.set("via", "institution");
            return done(await decideEnrolmentAction(null, fd));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`${kind}-${enrolment.id}`}>Reason shown to the learner</Label>
            <Textarea id={`${kind}-${enrolment.id}`} name="reason" rows={3} maxLength={500} required />
          </div>
        </ConfirmDialog>
      ))}
      <ConfirmDialog
        open={dialog === "complete"}
        onOpenChange={openChange("complete")}
        title={`Mark ${enrolment.candidateName} as completed?`}
        description="Results come from the batch's assessments (calculate them on the batch's assessments tab). Completed learners can receive a certificate of completion."
        confirmLabel="Mark completed"
        onConfirm={async () => done(await completeEnrolmentAction({ via: "institution", enrolmentId: enrolment.id }))}
      />
      <ConfirmDialog
        open={dialog === "fee"}
        onOpenChange={openChange("fee")}
        title={`Fee status for ${enrolment.candidateName}`}
        description="Record offline payments, waivers or refunds. Fees are never a condition of a job application or placement."
        confirmLabel="Save fee status"
        onConfirm={async (fd) =>
          done(
            await updateEnrolmentFeeAction({
              via: "institution",
              enrolmentId: enrolment.id,
              feeStatus: String(fd.get("feeStatus") ?? enrolment.feeStatus) as "pending",
              paymentReference: String(fd.get("paymentReference") ?? "") || undefined,
            }),
          )
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`fee-${enrolment.id}`}>Fee status</Label>
            <SimpleSelect
              id={`fee-${enrolment.id}`}
              name="feeStatus"
              defaultValue={enrolment.feeStatus}
              options={["pending", "paid", "waived", "refunded"].map((v) => ({ value: v, label: FEE_STATUS_LABELS[v] ?? v }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ref-${enrolment.id}`}>Receipt or payment reference (optional)</Label>
            <Input id={`ref-${enrolment.id}`} name="paymentReference" maxLength={120} />
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
