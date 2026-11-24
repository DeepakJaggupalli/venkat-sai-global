import type { NextRequest } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getInvoiceFooter } from "@/modules/commercial/config";
import { getInvoiceForStaff } from "@/modules/commercial/queries";
import { invoicePdfFilename, invoicePdfResponse, renderInvoicePdf } from "@/modules/commercial/worker-invoices-pdf";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { getSetting } from "@/modules/settings";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /admin/commercial/worker-invoices/[id]/pdf — the invoice (or credit note) as a PDF file for staff with
 * commercial.view (drafts carry a DRAFT watermark). Same content as the printable page, from the frozen snapshots.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getStaffContext();
  if (!ctx) return new Response("Sign in as staff to download invoices.", { status: 401 });
  if (!ctx.user.twoFactorEnabled && (await getSetting("security.require_staff_2fa"))) return new Response("Set up two-factor authentication first.", { status: 403 });
  if (!staffCan(ctx, "commercial.view")) return new Response("You do not have permission to download invoices.", { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found.", { status: 404 });
  const limit = await rateLimit(`admin:invoice-pdf:${ctx.user.id}`, 120, 3600);
  if (!limit.allowed) return new Response("Too many downloads. Try again later.", { status: 429 });

  try {
    const doc = await getInvoiceForStaff(ctx, id);
    if (!doc) return new Response("Not found.", { status: 404 });
    const footer = await getInvoiceFooter();
    const bytes = await renderInvoicePdf(doc, { timeZone: ctx.user.timezone ?? env().DEFAULT_TIMEZONE, footerNote: footer.note, paymentInstructions: footer.paymentInstructions });
    return invoicePdfResponse(bytes, invoicePdfFilename(doc));
  } catch (error) {
    logger.error("Invoice PDF failed", { error, invoiceId: id });
    return new Response("The PDF could not be made. Please try again.", { status: 500 });
  }
}
