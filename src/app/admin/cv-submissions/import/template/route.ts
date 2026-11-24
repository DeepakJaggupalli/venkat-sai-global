import { logger } from "@/lib/logger";
import { exportFilename, xlsxResponse } from "@/lib/xlsx-export";
import { getStaffContext, staffCan } from "@/modules/identity/authz";
import { STAFF_TWO_FACTOR_MESSAGE, staffTwoFactorMissing } from "@/modules/identity/staff-route";
import { cvImportTemplate } from "@/modules/operations/cv-import";

/** GET /admin/cv-submissions/import/template — the blank import workbook (candidates.manage). No personal data. */
export async function GET(): Promise<Response> {
  const ctx = await getStaffContext();
  if (!ctx) return new Response("Sign in as staff to download the template.", { status: 401 });
  if (!staffCan(ctx, "candidates.manage")) return new Response("You do not have permission to import CVs.", { status: 403 });
  if (await staffTwoFactorMissing(ctx)) return new Response(STAFF_TWO_FACTOR_MESSAGE, { status: 403 });
  try {
    return xlsxResponse(await cvImportTemplate(ctx), exportFilename("cv-import-template"));
  } catch (error) {
    logger.error("CV import template failed", { error });
    return new Response("The template could not be made. Please try again.", { status: 500 });
  }
}
