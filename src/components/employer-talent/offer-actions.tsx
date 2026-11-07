"use client";

import { Send, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirmJoinedAction, issueOfferAction, updatePlacementAction, withdrawOfferAction } from "@/modules/recruitment/actions";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function IssueOfferButton({ offerId, expiresAt }: { offerId: string; expiresAt: Date | null }) {
  const id = useId();
  const router = useRouter();
  const defaultExpiry = expiresAt ? new Date(expiresAt).toISOString().slice(0, 10) : "";
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" size="sm">
          <Send aria-hidden className="size-4" />
          Issue offer
        </Button>
      }
      title="Send this offer to the candidate?"
      description="The candidate is notified and can accept or decline. The offer letter is shared with them. Candidates are never asked to pay to accept an offer."
      confirmLabel="Issue offer"
      onSuccess={() => router.refresh()}
      onConfirm={(form) => {
        const date = String(form.get("expiresAt") ?? "").trim();
        return issueOfferAction({ portal: "employer", offerId, expiresAt: date ? new Date(`${date}T23:59:59`) : null });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={id}>Respond by (optional)</Label>
        <Input id={id} name="expiresAt" type="date" min={todayIso()} defaultValue={defaultExpiry} />
      </div>
    </ConfirmDialog>
  );
}

export function WithdrawOfferButton({ offerId }: { offerId: string }) {
  const id = useId();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" size="sm" variant="ghost">
          Withdraw
        </Button>
      }
      title="Withdraw this offer?"
      description="The candidate is told the offer is no longer available. The reason stays internal."
      confirmLabel="Withdraw offer"
      variant="destructive"
      onSuccess={() => router.refresh()}
      onConfirm={(form) => withdrawOfferAction({ portal: "employer", offerId, reason: String(form.get("reason") ?? "") })}
    >
      <div className="space-y-1.5">
        <Label htmlFor={id}>Reason (internal)</Label>
        <Textarea id={id} name="reason" rows={3} maxLength={1000} required />
      </div>
    </ConfirmDialog>
  );
}

export function ConfirmJoinedButton({ placementId }: { placementId: string }) {
  const id = useId();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" size="sm">
          <UserCheck aria-hidden className="size-4" />
          Confirm joining
        </Button>
      }
      title="Confirm the candidate has joined?"
      description="This closes the hiring process for this candidate. Venkat Sai is notified."
      confirmLabel="Confirm joining"
      onSuccess={() => router.refresh()}
      onConfirm={(form) => confirmJoinedAction({ portal: "employer", placementId, joinedOn: String(form.get("joinedOn") ?? "") })}
    >
      <div className="space-y-1.5">
        <Label htmlFor={id}>Joining date</Label>
        <Input id={id} name="joinedOn" type="date" max={todayIso()} defaultValue={todayIso()} required />
      </div>
    </ConfirmDialog>
  );
}

/** Employers may only flag that a replacement is needed (Venkat Sai handles the rest). */
export function RequestReplacementButton({ placementId }: { placementId: string }) {
  const id = useId();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" size="sm" variant="outline">
          Request replacement
        </Button>
      }
      title="Request a replacement?"
      description="Tell Venkat Sai why a replacement is needed. The team will follow up under your agreement."
      confirmLabel="Send request"
      onSuccess={() => router.refresh()}
      onConfirm={(form) => updatePlacementAction({ portal: "employer", placementId, status: "replacement_required", reason: String(form.get("reason") ?? "").trim() || null })}
    >
      <div className="space-y-1.5">
        <Label htmlFor={id}>Reason</Label>
        <Textarea id={id} name="reason" rows={3} maxLength={1000} required />
      </div>
    </ConfirmDialog>
  );
}
