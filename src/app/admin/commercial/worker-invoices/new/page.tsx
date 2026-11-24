import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import type { SearchParams } from "@/lib/http";
import { listInvoiceableWorkers, WORKER_INVOICES_ADMIN_PATH } from "@/modules/commercial/worker-invoices";
import { requireStaff } from "@/modules/identity/authz";

import { COMMERCIAL_CRUMB } from "../../_lib/nav";
import { WorkerInvoiceEditor } from "../_components/editor";

export const metadata: Metadata = { title: "New worker invoice" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/**
 * /admin/commercial/worker-invoices/new — ?org=<organisation id> chooses who pays, ?cv=<CV submission id> ticks a
 * worker (when the worker is already marked as supplied to an organisation and no ?org= is given, that one is chosen).
 */
export default async function NewWorkerInvoicePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaff("commercial.invoices");
  const sp = await searchParams;
  const organizationId = uuidParam(sp.org);
  const cv = uuidParam(sp.cv);
  if (!organizationId && cv) {
    const { included } = await listInvoiceableWorkers(staff, { includeIds: [cv], limit: 0 });
    const placed = included[0]?.placedOrganizationId;
    if (placed) redirect(`${WORKER_INVOICES_ADMIN_PATH}/new?org=${placed}&cv=${cv}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New worker invoice"
        description="Bill a travel agency or company for the workers we supplied. Choose who pays, tick the workers, enter the amount, then issue."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Worker invoices", href: WORKER_INVOICES_ADMIN_PATH }, { label: "New" }]}
      />
      <WorkerInvoiceEditor staff={staff} searchParams={sp} organizationId={organizationId} draft={null} preselectIds={cv ? [cv] : []} />
    </div>
  );
}
