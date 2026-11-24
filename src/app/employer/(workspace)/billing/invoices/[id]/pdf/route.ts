import type { NextRequest } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getInvoiceFooter } from "@/modules/commercial/config";
import { getInvoiceForViewer } from "@/modules/commercial/queries";
import { invoicePdfFilename, invoicePdfResponse, renderInvoicePdf } from "@/modules/commercial/worker-invoices-pdf";
import { getCurrentUser } from "@/modules/identity/session";

/**
 * GET /employer/billing/invoices/[id]/pdf (also /agency/…) — an issued invoice or credit note as a PDF file. Same
 * access as the printable page: members of the invoice's organisation with its billing permission (staff too);
 * anyone else gets 404, so the invoice's existence is not revealed. Drafts are never served here.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to download invoices.", { status: 401 });
  const limit = await rateLimit(`portal:invoice-pdf:${user.id}`, 60, 3600);
  if (!limit.allowed) return new Response("Too many downloads. Try again later.", { status: 429 });
  const { id } = await params;

  try {
    const data = await getInvoiceForViewer(id);
    if (!data || data.document.status === "draft") return new Response("Not found.", { status: 404 });
    const footer = await getInvoiceFooter();
    const bytes = await renderInvoicePdf(data.document, { timeZone: user.timezone ?? env().DEFAULT_TIMEZONE, footerNote: footer.note, paymentInstructions: footer.paymentInstructions });
    return invoicePdfResponse(bytes, invoicePdfFilename(data.document));
  } catch (error) {
    logger.error("Portal invoice PDF failed", { error, invoiceId: id });
    return new Response("The PDF could not be made. Please try again.", { status: 500 });
  }
}
