"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

import { deleteWorkerInvoiceDraftAction } from "../actions";

/** Delete a worker invoice draft (no number yet, so nothing is lost from the GST series). */
export function DeleteWorkerDraftButton({ invoiceId, listHref }: { invoiceId: string; listHref: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" className="h-11 rounded-full px-5">
          <Trash2 aria-hidden="true" />
          Delete draft
        </Button>
      }
      title="Delete this draft?"
      description="The draft has no invoice number yet, so nothing is lost from the invoice series. The workers stay marked as supplied to this organisation."
      confirmLabel="Delete draft"
      variant="destructive"
      onConfirm={async () => {
        const result = await deleteWorkerInvoiceDraftAction({ invoiceId });
        if (result.ok) router.push(listHref);
        return result;
      }}
    />
  );
}
