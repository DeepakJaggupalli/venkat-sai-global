import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { formatMoney } from "@/lib/format";
import { formatMinorPlain, minorUnitsFor } from "@/modules/commercial/money";
import { requireStaff } from "@/modules/identity/authz";
import { currencyOptions } from "@/modules/taxonomy/queries";

import { OfflinePaymentForm } from "../../_components/offline-payment-form";
import { ADMIN_COMMERCIAL, COMMERCIAL_CRUMB } from "../../_lib/nav";
import { listOrganizationOptions, listPayableInvoiceOptions } from "../../_lib/queries";

export const metadata: Metadata = { title: "Record payment" };

export default async function NewPaymentPage() {
  const staff = await requireStaff("commercial.payments");
  const [invoices, orgs, currencies] = await Promise.all([listPayableInvoiceOptions(staff), listOrganizationOptions(staff), currencyOptions()]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record a payment"
        description="For money received outside the online gateways. The invoice is marked paid or partially paid automatically."
        breadcrumbs={[COMMERCIAL_CRUMB, { label: "Payments", href: `${ADMIN_COMMERCIAL}/payments` }, { label: "Record" }]}
      />
      <SectionCard title="Payment">
        <OfflinePaymentForm
          mode="any"
          today={new Date().toISOString().slice(0, 10)}
          invoices={invoices.map((i) => {
            const due = i.totalMinor - i.paidMinor;
            return {
              value: i.id,
              label: `${i.code ?? "Invoice"} · ${i.organizationName ?? "Individual"} · ${formatMoney(due, i.currency)} due`,
              currency: i.currency,
              outstanding: formatMinorPlain(due, minorUnitsFor(i.currency)),
            };
          })}
          organizations={orgs.map((o) => ({ value: o.value, label: o.label }))}
          currencies={currencies}
        />
      </SectionCard>
    </div>
  );
}
