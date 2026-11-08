import "server-only";

import type { PlatformPermission } from "@/config/permissions";
import { ActionError } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { buildXlsx, EXPORT_MAX_ROWS, exportFilename, xlsxResponse, type XlsxColumn } from "@/lib/xlsx-export";
import { audit, logDataAccess } from "@/modules/audit";
import { getStaffContext, staffCan, type StaffContext } from "@/modules/identity/authz";

import { exportVisibility } from "./people";

/**
 * Shared GET handler body for staff Excel exports: authorise (same permission as the list page), rate limit, build
 * the sheet, then record the export in the data-access log and the audit trail (who, which list, filters, row count,
 * whether full phone numbers / passport numbers were included).
 */

export type ExportSheet<T> = {
  title: string;
  /** Human-readable filters for the title row. */
  filters: string[];
  rows: T[];
  columns: XlsxColumn<T>[];
  /** Total matching rows (for the truncation note). */
  total: number;
  /** Raw filter values for the logs. */
  filterValues?: Record<string, unknown>;
};

/** Rows to fetch: one more than the cap tells us the list was cut short when the total is unknown. */
export const EXPORT_FETCH_LIMIT = EXPORT_MAX_ROWS;

export async function staffExport<T>(opts: {
  permission: PlatformPermission | PlatformPermission[];
  mode?: "all" | "any";
  /** Stable list key for logs, e.g. "cv_submissions". */
  list: string;
  /** File name slug, e.g. "cv-submissions". */
  slug: string;
  /** Personal data categories in the sheet. */
  dataCategory?: string;
  build: (ctx: StaffContext) => Promise<ExportSheet<T> | null>;
}): Promise<Response> {
  const ctx = await getStaffContext();
  if (!ctx) return new Response("Sign in as staff to download this list.", { status: 401 });
  if (!staffCan(ctx, opts.permission, opts.mode ?? "all")) return new Response("You do not have permission to download this list.", { status: 403 });
  const limit = await rateLimit(`admin:xlsx-export:${ctx.user.id}`, 30, 3600);
  if (!limit.allowed) return new Response("Too many downloads. Try again later.", { status: 429 });

  try {
    const sheet = await opts.build(ctx);
    if (!sheet) return new Response("Not found.", { status: 404 });
    const generatedAt = new Date();
    const bytes = await buildXlsx({ title: sheet.title, filters: sheet.filters, rows: sheet.rows, columns: sheet.columns, totalRows: sheet.total, generatedAt });
    const rowCount = Math.min(sheet.rows.length, EXPORT_MAX_ROWS);
    const visibility = exportVisibility(ctx);
    const metadata = { list: opts.list, title: sheet.title, filters: sheet.filterValues ?? sheet.filters, rowCount, total: sheet.total, truncated: sheet.total > rowCount, fullPhoneNumbers: visibility.fullPhone, fullPassportNumbers: visibility.fullPassport, format: "xlsx" };
    await logDataAccess({ actorUserId: ctx.user.id, subjectType: "export", subjectId: opts.list, dataCategory: opts.dataCategory ?? "contact", accessType: "export", reason: `Excel download: ${sheet.title}`, metadata });
    await audit({ action: "export.downloaded", entityType: "export", entityId: null, actorUserId: ctx.user.id, metadata });
    return xlsxResponse(bytes, exportFilename(opts.slug, generatedAt));
  } catch (error) {
    if (error instanceof ActionError) return new Response(error.message, { status: error.code === "forbidden" ? 403 : 400 });
    logger.error("Excel export failed", { error, list: opts.list });
    return new Response("The list could not be exported. Please try again.", { status: 500 });
  }
}

/** Search params of a request as a plain object (first value per key; arrays for repeated keys). */
export function queryObject(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    out[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  return out;
}
