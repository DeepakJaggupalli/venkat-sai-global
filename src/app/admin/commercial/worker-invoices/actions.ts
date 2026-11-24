"use server";

import { revalidatePath } from "next/cache";

import { createAction, createFormAction, ok } from "@/lib/actions";
import { ADMIN_COMMERCIAL_PATHS, BILLING_PATHS, PORTAL_BILLING_PATH } from "@/modules/commercial/constants";
import { deleteWorkerInvoiceDraft, saveWorkerInvoice, WORKER_INVOICES_ADMIN_PATH } from "@/modules/commercial/worker-invoices";
import { workerInvoiceFormSchema, workerInvoiceIdSchema } from "@/modules/commercial/worker-invoices-schemas";
import { requireStaff } from "@/modules/identity/authz";

function revalidateWorkerInvoices(invoiceId?: string): void {
  revalidatePath(WORKER_INVOICES_ADMIN_PATH, "layout");
  revalidatePath(ADMIN_COMMERCIAL_PATHS.home, "layout");
  revalidatePath(PORTAL_BILLING_PATH.employer);
  revalidatePath(`${PORTAL_BILLING_PATH.employer}/invoices`);
  if (invoiceId) revalidatePath(BILLING_PATHS.invoice(invoiceId));
}

/** Save a worker invoice draft, or save and issue it (commercial.invoices; re-checked by the service). */
export const saveWorkerInvoiceAction = createFormAction(workerInvoiceFormSchema, async (input) => {
  const ctx = await requireStaff("commercial.invoices");
  const result = await saveWorkerInvoice(ctx, input);
  revalidateWorkerInvoices(result.invoice.id);
  const message = result.issued
    ? `Invoice ${result.invoice.code ?? ""} issued`
    : result.issueProblem
      ? `Saved as a draft, not issued yet. ${result.issueProblem}`
      : "Draft saved";
  return ok({ id: result.invoice.id, issued: result.issued, code: result.invoice.code, issueProblem: result.issueProblem }, message);
});

/** Delete a worker invoice draft (commercial.invoices). */
export const deleteWorkerInvoiceDraftAction = createAction(workerInvoiceIdSchema, async ({ invoiceId }) => {
  const ctx = await requireStaff("commercial.invoices");
  await deleteWorkerInvoiceDraft(ctx, invoiceId);
  revalidateWorkerInvoices();
  return ok(undefined, "Draft deleted");
});
