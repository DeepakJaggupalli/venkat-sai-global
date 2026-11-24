import type { NextRequest } from "next/server";

import { formatExportDate, formatExportDateTime } from "@/lib/xlsx-export";
import { formatMoney } from "@/lib/format";
import { EXPORT_FETCH_LIMIT, staffExport } from "@/modules/exports/http";
import { exportVisibility, formatPhone } from "@/modules/exports/people";
import { CV_SUBMISSION_STATUS_LABELS } from "@/modules/operations/cv-submission-schemas";
import { getReferrerSummary, listReferredCvsForExport, listReferrersForExport, type ReferredExportRow, type ReferrerExportRow } from "@/modules/referrals/queries";
import { referralFiltersSchema, REFERRER_STATUS_LABELS, REWARD_STATUS_LABELS } from "@/modules/referrals/schemas";

/**
 * GET /admin/referrals/export?<list filters> — Excel download of the referred CVs (default) or, with view=referrers,
 * of the referrers (candidates.manage). Mobile numbers are full only with candidates.view_contact; every download is
 * logged with its filters (staffExport).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const p = request.nextUrl.searchParams;
  const filters = referralFiltersSchema.parse({
    view: p.get("view") ?? undefined,
    reward: p.get("reward") ?? undefined,
    status: p.get("status") ?? undefined,
    referrer: p.get("referrer") ?? undefined,
    q: p.get("q") ?? undefined,
  });

  if (filters.view === "referrers") {
    return staffExport<ReferrerExportRow>({
      permission: "candidates.manage",
      list: "referrers",
      slug: "referrers",
      dataCategory: "contact",
      build: async (ctx) => {
        const visibility = exportVisibility(ctx);
        const { rows, total } = await listReferrersForExport(ctx, filters, EXPORT_FETCH_LIMIT);
        const labels = [filters.status ? `Status: ${REFERRER_STATUS_LABELS[filters.status]}` : null, filters.q ? `Search: "${filters.q}"` : null].filter((v): v is string => Boolean(v));
        return {
          title: "Referrers",
          filters: labels,
          filterValues: { view: filters.view, status: filters.status, q: filters.q },
          rows,
          total,
          columns: [
            { header: "Name", value: (r) => r.name },
            { header: "Mobile", value: (r) => formatPhone(visibility, r.phoneRaw) },
            { header: "Code", value: (r) => r.code },
            { header: "Link", value: (r) => r.url },
            { header: "Status", value: (r) => REFERRER_STATUS_LABELS[r.status] },
            { header: "Sent a CV", value: (r) => r.referredCount },
            { header: "Placed abroad", value: (r) => r.placedCount },
            { header: "Rewards due", value: (r) => r.dueCount },
            { header: "Rewards paid", value: (r) => r.paidCount },
            { header: "Paid in total", value: (r) => r.paidTotals.map((t) => formatMoney(t.amountMinor, t.currency)).join("; ") },
            { header: "Joined", value: (r) => formatExportDateTime(r.createdAt) },
          ],
        };
      },
    });
  }

  return staffExport<ReferredExportRow>({
    permission: "candidates.manage",
    list: "referred_cvs",
    slug: "referrals",
    dataCategory: "contact",
    build: async (ctx) => {
      const visibility = exportVisibility(ctx);
      const [{ rows, total }, referrer] = await Promise.all([listReferredCvsForExport(ctx, filters, EXPORT_FETCH_LIMIT), filters.referrer ? getReferrerSummary(ctx, filters.referrer) : null]);
      const labels = [
        filters.reward ? `Reward: ${REWARD_STATUS_LABELS[filters.reward]}` : null,
        filters.referrer ? `Referred by: ${referrer ? `${referrer.name} (${referrer.code})` : "selected referrer"}` : null,
        filters.q ? `Search: "${filters.q}"` : null,
      ].filter((v): v is string => Boolean(v));
      return {
        title: "Referred CVs and rewards",
        filters: labels,
        filterValues: { reward: filters.reward, referrer: filters.referrer, q: filters.q },
        rows,
        total,
        columns: [
          { header: "Referred person", value: (r) => r.name },
          { header: "Trade", value: (r) => r.tradeLabel },
          { header: "CV reference", value: (r) => r.code },
          { header: "CV status", value: (r) => CV_SUBMISSION_STATUS_LABELS[r.status] },
          { header: "Reward", value: (r) => REWARD_STATUS_LABELS[r.reward] },
          { header: "Referred by", value: (r) => r.referrer.name },
          { header: "Referrer mobile", value: (r) => formatPhone(visibility, r.referrerPhoneRaw) },
          { header: "Referrer code", value: (r) => r.referrer.code },
          { header: "Amount paid", value: (r) => (r.payout ? formatMoney(r.payout.amountMinor, r.payout.currency) : "") },
          { header: "Currency", value: (r) => r.payout?.currency ?? "" },
          { header: "Paid on", value: (r) => (r.payout ? formatExportDate(r.payout.paidAt) : "") },
          { header: "Paid by", value: (r) => r.payout?.paidByName ?? "" },
          { header: "Payment note", value: (r) => r.payout?.note ?? "", wrap: true },
          { header: "Same number as referrer", value: (r) => (r.selfReferral ? "Yes" : "") },
          { header: "CV received", value: (r) => formatExportDateTime(r.createdAt) },
        ],
      };
    },
  });
}
