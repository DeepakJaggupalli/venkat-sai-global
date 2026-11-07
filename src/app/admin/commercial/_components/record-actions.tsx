"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SimpleSelect } from "@/components/shared/selects";
import type { SelectOption } from "@/components/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import {
  allocatePaymentAction,
  applyCouponToDraftAction,
  deleteDraftInvoiceAction,
  issueInvoiceAction,
  removeCouponFromDraftAction,
  requestRefundAction,
  voidInvoiceAction,
} from "@/modules/commercial/actions";

/** Runs an action, toasts, refreshes; returns the result so ConfirmDialog keeps itself open on errors. */
function useRun() {
  const router = useRouter();
  return async <T,>(result: Promise<ActionResult<T>>, after?: (r: ActionResult<T>) => void) => {
    const r = await result;
    if (r.ok) {
      router.refresh();
      after?.(r);
    }
    return r;
  };
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function IssueInvoiceButton({ invoiceId, disabled }: { invoiceId: string; disabled?: boolean }) {
  const run = useRun();
  return (
    <ConfirmDialog
      trigger={<Button disabled={disabled}>Issue invoice</Button>}
      title="Issue this invoice?"
      description="It gets the next GST invoice number, the seller and buyer details are frozen, and the buyer is notified. Issued invoices cannot be edited, only voided."
      confirmLabel="Issue invoice"
      onConfirm={async (fd) => {
        const raw = String(fd.get("dueDays") ?? "").trim();
        const dueDays = raw ? Number.parseInt(raw, 10) : undefined;
        if (dueDays !== undefined && (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 120)) return { ok: false, error: "Days until due must be between 0 and 120." };
        return run(issueInvoiceAction({ invoiceId, dueDays }));
      }}
    >
      <Field id="issue-due-days" label="Days until due (optional)" hint="Blank = the default from settings.">
        <Input id="issue-due-days" name="dueDays" type="number" min={0} max={120} inputMode="numeric" />
      </Field>
    </ConfirmDialog>
  );
}

export function DeleteDraftButton({ invoiceId }: { invoiceId: string }) {
  const run = useRun();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Delete draft</Button>}
      title="Delete this draft?"
      description="The draft has no number yet, so nothing is lost from the invoice series."
      confirmLabel="Delete draft"
      variant="destructive"
      onConfirm={() => run(deleteDraftInvoiceAction({ invoiceId }), () => router.push("/admin/commercial/invoices"))}
    />
  );
}

export function VoidInvoiceButton({ invoiceId, code }: { invoiceId: string; code: string | null }) {
  const run = useRun();
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Void invoice</Button>}
      title={`Void ${code ?? "this invoice"}?`}
      description="Only invoices with nothing paid can be voided. The number stays used; a pending subscription linked to it is cancelled and any coupon is released."
      confirmLabel="Void invoice"
      variant="destructive"
      onConfirm={(fd) => run(voidInvoiceAction(null, fd))}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field id="void-reason" label="Reason" hint="At least 5 characters. Recorded in the audit log.">
        <Textarea id="void-reason" name="reason" rows={2} maxLength={500} required />
      </Field>
    </ConfirmDialog>
  );
}

export function DraftCouponControl({ invoiceId, couponCode }: { invoiceId: string; couponCode: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const run = (p: Promise<ActionResult<unknown>>) =>
    start(async () => {
      const r = await p;
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        setCode("");
        router.refresh();
      } else toast.error(r.error);
    });
  if (couponCode) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          Coupon <span className="font-mono font-medium">{couponCode}</span> is applied when the invoice is issued.
        </span>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(removeCouponFromDraftAction({ invoiceId }))}>
          Remove coupon
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field id="draft-coupon" label="Coupon code">
        <Input id="draft-coupon" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={40} className="w-48 uppercase" autoComplete="off" />
      </Field>
      <Button variant="outline" disabled={pending || code.trim().length < 3} onClick={() => run(applyCouponToDraftAction({ invoiceId, code: code.trim() }))}>
        Apply coupon
      </Button>
    </div>
  );
}

export function RefundRequestButton({ paymentId, label }: { paymentId: string; label: string }) {
  const run = useRun();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Request a refund of ${label}`}>
          Refund
        </Button>
      }
      title={`Refund ${label}?`}
      description="The request goes to the approvals inbox. Gateway payments are refunded automatically once approved; offline payments are completed by finance with the payout reference."
      confirmLabel="Send for approval"
      onConfirm={(fd) => run(requestRefundAction(null, fd))}
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <Field id={`refund-amount-${paymentId}`} label="Amount (optional)" hint="Blank = the full refundable amount.">
        <Input id={`refund-amount-${paymentId}`} name="amount" inputMode="decimal" maxLength={20} />
      </Field>
      <Field id={`refund-reason-${paymentId}`} label="Reason" hint="At least 10 characters.">
        <Textarea id={`refund-reason-${paymentId}`} name="reason" rows={2} maxLength={1000} required />
      </Field>
    </ConfirmDialog>
  );
}

export function AllocatePaymentButton({ paymentId, invoices }: { paymentId: string; invoices: SelectOption[] }) {
  const run = useRun();
  const [invoiceId, setInvoiceId] = useState("");
  if (!invoices.length) return null;
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm">
          Allocate
        </Button>
      }
      title="Allocate this advance payment"
      description="Apply the payment to an open invoice of the same organisation and currency."
      confirmLabel="Allocate"
      onConfirm={() => (invoiceId ? run(allocatePaymentAction({ paymentId, invoiceId })) : Promise.resolve({ ok: false as const, error: "Choose an invoice." }))}
    >
      <Field id={`allocate-${paymentId}`} label="Invoice">
        <SimpleSelect id={`allocate-${paymentId}`} options={invoices} value={invoiceId} onValueChange={setInvoiceId} placeholder="Choose an invoice" />
      </Field>
    </ConfirmDialog>
  );
}
