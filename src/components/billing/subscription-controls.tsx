"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cancelSubscriptionAction, resumeSubscriptionAction, setAutoRenewAction } from "@/modules/commercial/actions";

import type { BillingPortal } from "./portal-config";

type Props = {
  subscriptionId: string;
  planName: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  hasPeriodEnd: boolean;
  /** Portal members (period-end cancellation only); omit for Command Centre staff. */
  portal?: BillingPortal;
};

/** Cancel at period end, resume and automatic renewal for one subscription. */
export function SubscriptionControls({ subscriptionId, planName, status, cancelAtPeriodEnd, autoRenew, hasPeriodEnd, portal }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const live = ["trialing", "active", "past_due", "paused", "pending"].includes(status);
  if (!live) return null;

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        if (result.message) toast.success(result.message);
        router.refresh();
      } else toast.error(result.error ?? "Something went wrong. Please try again.");
    });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
      {hasPeriodEnd && !cancelAtPeriodEnd ? (
        <div className="flex items-center gap-2">
          <Switch
            id={`auto-renew-${subscriptionId}`}
            checked={autoRenew}
            disabled={pending}
            onCheckedChange={(checked) => run(() => setAutoRenewAction({ subscriptionId, autoRenew: checked, portal }))}
          />
          <Label htmlFor={`auto-renew-${subscriptionId}`}>Renew automatically</Label>
        </div>
      ) : null}
      {cancelAtPeriodEnd ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => resumeSubscriptionAction({ subscriptionId, portal }))}>
          Keep my plan
        </Button>
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm">
              {portal ? "Cancel plan" : "Cancel subscription"}
            </Button>
          }
          title={`Cancel ${planName}?`}
          description={
            portal
              ? "Your plan stays active until the end of the current period and is not renewed. You can change your mind until then."
              : "Choose whether the subscription ends now or at the end of the current period. The change is recorded in the audit log."
          }
          confirmLabel="Cancel plan"
          cancelLabel="Keep plan"
          variant="destructive"
          onConfirm={async (formData) => {
            const result = await cancelSubscriptionAction(null, formData);
            if (result.ok) router.refresh();
            return result;
          }}
        >
          <input type="hidden" name="subscriptionId" value={subscriptionId} />
          {portal ? <input type="hidden" name="portal" value={portal} /> : null}
          <div className="space-y-1.5">
            <Label htmlFor={`cancel-reason-${subscriptionId}`}>Reason (optional)</Label>
            <Textarea id={`cancel-reason-${subscriptionId}`} name="reason" maxLength={500} rows={2} />
          </div>
          {!portal ? (
            <div className="flex items-center gap-2">
              <Checkbox id={`cancel-now-${subscriptionId}`} name="immediately" />
              <Label htmlFor={`cancel-now-${subscriptionId}`}>End immediately instead of at the period end</Label>
            </div>
          ) : null}
        </ConfirmDialog>
      )}
    </div>
  );
}
