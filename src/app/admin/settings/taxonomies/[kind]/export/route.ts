import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { getStaffContext, staffCan } from "@/modules/identity/authz";

import { isTaxonomyKind } from "../../_lib/config";
import { exportTaxonomyCsv } from "../../_lib/queries";

/** CSV export of one reference list (settings.view). Reference data only — no personal data. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await getStaffContext();
  if (!ctx) return new NextResponse("Sign in as staff to export.", { status: 401 });
  if (!staffCan(ctx, "settings.view")) return new NextResponse("You do not have permission to export settings.", { status: 403 });
  const { kind } = await params;
  if (!isTaxonomyKind(kind)) return new NextResponse("Not found", { status: 404 });
  try {
    const csv = await exportTaxonomyCsv(kind);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vsg-${kind}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error("Taxonomy export failed", { error, kind });
    return new NextResponse("The export could not be created. Try again.", { status: 500 });
  }
}
