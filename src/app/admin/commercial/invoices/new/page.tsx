import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireStaff } from "@/modules/identity/authz";

import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { InvoiceEditor } from "../_components/invoice-editor";
import { loadInvoiceEditorData } from "../_lib/editor-data";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const staff = await requireStaff("commercial.invoices");
  const data = await loadInvoiceEditorData(staff);
  return (
    <div className="space-y-6">
      <PageHeader
        title="New invoice"
        description="Save as a draft, check the tax preview, then issue. Services only: candidates are never invoiced for jobs."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Invoices", href: `${ADMIN_COMMERCIAL}/invoices` }, { label: "New" }]}
      />
      <SectionCard title="Invoice">
        <InvoiceEditor {...data} />
      </SectionCard>
    </div>
  );
}
