import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { toCsv } from "@/lib/http";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/modules/audit";
import { getStaffContext, staffCan } from "@/modules/identity/authz";

import { AUDIT_EXPORT_LIMIT } from "../_components/audit-ui";
import {
  auditFilterSchema,
  dataAccessFilterSchema,
  listAuditLogs,
  listDataAccessLogs,
  listSecurityEvents,
  securityFilterSchema,
} from "../_lib/queries";

/**
 * CSV export of the audit trail, security events or data-access log with the page's filters
 * (audit.view). Capped at AUDIT_EXPORT_LIMIT rows, rate limited, and the export itself is audited.
 */
export async function GET(request: NextRequest) {
  const ctx = await getStaffContext();
  if (!ctx) return new NextResponse("Sign in as staff to export.", { status: 401 });
  if (!staffCan(ctx, "audit.view")) return new NextResponse("You do not have permission to export logs.", { status: 403 });
  const limit = await rateLimit(`admin:audit-export:${ctx.user.id}`, 20, 3600);
  if (!limit.allowed) return new NextResponse("Too many exports. Try again later.", { status: 429 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const log = params.log === "security" || params.log === "data-access" ? params.log : "audit";
  const tz = ctx.user.timezone ?? env().DEFAULT_TIMEZONE;
  const page = { page: 1, pageSize: AUDIT_EXPORT_LIMIT, offset: 0 };
  const json = (v: unknown) => (v && typeof v === "object" && Object.keys(v).length ? JSON.stringify(v) : "");

  try {
    let csv: string;
    let rows: number;
    let filters: Record<string, unknown>;
    if (log === "security") {
      const f = securityFilterSchema.parse(params);
      const res = await listSecurityEvents(f, page, tz);
      rows = res.items.length;
      filters = f;
      csv = toCsv(
        res.items.map((r) => ({ ...r, metadata: json(r.metadata) })),
        [
          { key: "occurredAt", header: "Occurred at (UTC)" },
          { key: "type", header: "Event" },
          { key: "severity", header: "Severity" },
          { key: "userId", header: "Account ID" },
          { key: "userName", header: "Account name" },
          { key: "userAgent", header: "Browser" },
          { key: "metadata", header: "Metadata" },
        ],
      );
    } else if (log === "data-access") {
      const f = dataAccessFilterSchema.parse(params);
      const res = await listDataAccessLogs(f, page, tz);
      rows = res.items.length;
      filters = f;
      csv = toCsv(
        res.items.map((r) => ({ ...r, metadata: json(r.metadata) })),
        [
          { key: "occurredAt", header: "Occurred at (UTC)" },
          { key: "accessType", header: "Access" },
          { key: "dataCategory", header: "Data category" },
          { key: "actorUserId", header: "Accessed by (ID)" },
          { key: "actorName", header: "Accessed by" },
          { key: "actorOrganizationName", header: "Organisation" },
          { key: "subjectType", header: "Subject type" },
          { key: "subjectId", header: "Subject ID" },
          { key: "subjectUserId", header: "Subject account ID" },
          { key: "subjectName", header: "Subject name" },
          { key: "reason", header: "Reason" },
          { key: "metadata", header: "Metadata" },
        ],
      );
    } else {
      const f = auditFilterSchema.parse(params);
      const res = await listAuditLogs(f, page, tz);
      rows = res.items.length;
      filters = f;
      csv = toCsv(
        res.items.map((r) => ({ ...r, metadata: json(r.metadata) })),
        [
          { key: "occurredAt", header: "Occurred at (UTC)" },
          { key: "action", header: "Action" },
          { key: "entityType", header: "Record type" },
          { key: "entityId", header: "Record ID" },
          { key: "actorType", header: "Actor type" },
          { key: "actorUserId", header: "Actor ID" },
          { key: "actorName", header: "Actor name" },
          { key: "organizationId", header: "Organisation ID" },
          { key: "organizationName", header: "Organisation" },
          { key: "requestId", header: "Request ID" },
          { key: "metadata", header: "Metadata" },
        ],
      );
    }
    await audit({ action: "audit.exported", entityType: "audit_log", entityId: log, metadata: { log, rows, filters } });
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vsg-${log}-log-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error("Audit export failed", { error, log });
    return new NextResponse("The export could not be created. Try again.", { status: 500 });
  }
}
