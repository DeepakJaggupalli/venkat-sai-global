import { isUuid } from "@/app/admin/pipeline/_shared/server";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { STAFF_TWO_FACTOR_MESSAGE, staffTwoFactorMissing } from "@/modules/identity/staff-route";
import { renderDocumentForStaff } from "@/modules/documents/service";

/** GET /admin/documents/{id}/pdf — staff preview or download (training.certificates). Not approved = "DRAFT" watermark. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getStaffContext();
  if (!ctx) return new Response("Sign in again.", { status: 401 });
  if (!staffCan(ctx, "training.certificates")) return new Response("Forbidden", { status: 403 });
  if (await staffTwoFactorMissing(ctx)) return new Response(STAFF_TWO_FACTOR_MESSAGE, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const out = await renderDocumentForStaff(ctx, id);
  if (!out) return new Response("Not found", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(Buffer.from(out.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${out.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
