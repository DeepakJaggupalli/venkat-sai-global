import { Users } from "lucide-react";

import { BillingProfileForm } from "@/components/billing/billing-profile-form";
import { Callout } from "@/components/shared/callout";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { SectionCard } from "@/components/shared/section-card";
import type { SearchParams } from "@/lib/http";
import { EMPLOYER_KIND_LABELS } from "@/modules/organizations/employer-kind";
import {
  getWorkerInvoiceReadiness,
  listInvoiceableRequirementOptions,
  listInvoiceableWorkers,
  listWorkerInvoiceOrganizations,
  WORKER_INVOICES_ADMIN_PATH,
  type WorkerInvoiceDetail,
} from "@/modules/commercial/worker-invoices";
import { preselectProblem, type InvoiceableWorker } from "@/modules/commercial/worker-invoices-rules";
import { invoiceableWorkerFiltersSchema } from "@/modules/commercial/worker-invoices-schemas";
import { staffCan, type StaffContext } from "@/modules/identity/authz";
import { countryOptions, currencyOptions } from "@/modules/taxonomy/queries";

import { OrganizationPicker } from "./organization-picker";
import { WorkerInvoiceForm } from "./worker-invoice-form";

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** A worker on an older draft whose CV submission is gone: shown so staff can untick it. */
function missingWorker(submissionId: string, description: string): InvoiceableWorker {
  return {
    id: submissionId,
    code: "",
    name: description.replace(/^Recruitment service charge - /, ""),
    tradeLabel: "",
    status: "on_hold",
    invoiceable: false,
    passportLast4: null,
    requirementTitle: null,
    placedOrganizationId: null,
    placedOrganizationName: null,
    alreadyInvoiced: null,
  };
}

/**
 * The worker invoice editor shared by /new and the draft page: 1. who pays (organisation, from the URL), what stops
 * issuing (billing details, tax rates, seller details) with the billing details form right there, 2. the worker picker
 * (search, requirement, "supplied to this organisation") and the amounts form.
 */
export async function WorkerInvoiceEditor({
  staff,
  searchParams,
  organizationId,
  draft,
  preselectIds = [],
}: {
  staff: StaffContext;
  searchParams: SearchParams;
  organizationId: string | null;
  draft: WorkerInvoiceDetail | null;
  preselectIds?: string[];
}) {
  const filters = invoiceableWorkerFiltersSchema.parse({ q: str(searchParams.q), requirement: str(searchParams.requirement), placed: str(searchParams.placed) });
  const [organizations, currencies, requirementOptions, countries, readiness] = await Promise.all([
    draft ? Promise.resolve([]) : listWorkerInvoiceOrganizations(staff),
    currencyOptions(),
    listInvoiceableRequirementOptions(staff),
    organizationId ? countryOptions() : Promise.resolve([]),
    organizationId ? getWorkerInvoiceReadiness(staff, organizationId) : Promise.resolve(null),
  ]);
  const includeIds = draft ? draft.lines.map((l) => l.submissionId) : preselectIds;
  const picker = readiness
    ? await listInvoiceableWorkers(staff, { organizationId: readiness.organization.id, filters, includeIds, excludeInvoiceId: draft?.invoice.id ?? null })
    : includeIds.length
      ? await listInvoiceableWorkers(staff, { includeIds, limit: 0 })
      : null;
  const included = new Map((picker?.included ?? []).map((w) => [w.id, w]));
  const initial = draft
    ? draft.lines.map((l) => ({ worker: included.get(l.submissionId) ?? missingWorker(l.submissionId, l.description), amount: l.amount }))
    : preselectIds.map((id) => included.get(id)).filter((w): w is InvoiceableWorker => Boolean(w && w.invoiceable && !w.alreadyInvoiced)).map((worker) => ({ worker, amount: "" }));
  // ?cv= workers that cannot be ticked, said in plain words instead of silently leaving them out.
  const preselectProblems = draft ? [] : preselectIds.map((id) => preselectProblem(included.get(id), readiness?.organization.name ?? null)).filter((p): p is string => Boolean(p));
  const orgOptions = organizations.map((o) => ({
    value: o.id,
    label: o.name,
    description: `${EMPLOYER_KIND_LABELS[o.kind]}${o.hasBillingProfile ? ` · bills in ${o.billingCurrency}` : " · no billing details yet"}`,
  }));
  const canEditBilling = staffCan(staff, "commercial.invoices");
  const issueBlocked = readiness?.blockers.length ? readiness.blockers.join(" ") : null;
  const placedOptions = [{ value: "1", label: `Only workers supplied to ${readiness?.organization.name ?? "this organisation"}` }];

  return (
    <div className="space-y-6">
      <SectionCard title="1. Who pays?" description="The travel agency or company the workers were supplied to.">
        {draft ? (
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">{readiness?.organization.name ?? draft.organization?.name ?? "Organisation not found"}</p>
            <p className="text-sm text-muted-foreground">To bill another organisation, delete this draft and start a new invoice.</p>
          </div>
        ) : (
          <OrganizationPicker options={orgOptions} value={readiness?.organization.id ?? null} />
        )}
        {readiness ? <p className="mt-3 text-sm text-muted-foreground">{EMPLOYER_KIND_LABELS[readiness.organization.kind]}</p> : null}
        {organizationId && !readiness ? (
          <Callout tone="warning" className="mt-4">
            This travel agency or company could not be found. Choose another one.
          </Callout>
        ) : null}
        {!organizationId && preselectIds.length && initial.length ? (
          <Callout tone="info" className="mt-4">
            {initial.map((t) => t.worker.name).join(", ")} will be ticked. Choose who pays to continue.
          </Callout>
        ) : null}
        {preselectProblems.length ? (
          <Callout tone="warning" className="mt-4">
            {preselectProblems.join(" ")}
          </Callout>
        ) : null}
      </SectionCard>

      {readiness ? (
        <>
          {readiness.blockers.length ? (
            <Callout tone="warning" title="This invoice cannot be issued yet">
              <ul className="list-disc space-y-1 pl-5">
                {readiness.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="mt-2">You can still save a draft and issue it later.</p>
            </Callout>
          ) : null}
          {readiness.notes.map((n) => (
            <Callout key={n.message} tone="info" action={{ label: n.linkLabel, href: n.href, variant: "outline" }}>
              {n.message}
            </Callout>
          ))}

          {canEditBilling ? (
            readiness.billingProfile ? (
              <details className="group rounded-xl border border-border bg-card">
                <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground">
                  <span className="min-w-0 break-words">
                    Billing details: {readiness.billingProfile.legalName}
                    {readiness.billingProfile.taxId ? ` · ${readiness.billingProfile.taxId}` : ""} · {readiness.billingProfile.currency}
                  </span>
                  <span className="shrink-0 text-teal-strong group-open:hidden">Edit</span>
                </summary>
                <div className="border-t border-border p-4 sm:p-5">
                  <BillingProfileForm target={{ organizationId: readiness.organization.id }} defaults={readiness.billingProfile} countries={countries} currencies={currencies} canEdit />
                </div>
              </details>
            ) : (
              <SectionCard title={`Billing details of ${readiness.organization.name}`} description="Needed to issue the invoice: printed on it, and used for GST. Filled in from the organisation where we can.">
                <BillingProfileForm target={{ organizationId: readiness.organization.id }} defaults={readiness.billingDefaults} countries={countries} currencies={currencies} canEdit />
              </SectionCard>
            )
          ) : null}

          <SectionCard title="2. Workers and amount" description="Workers who are selected, at medical, visa or ticket stage, or departed. One invoice line per worker.">
            <FilterScope>
              <FilterBar paramKeys={["q", "requirement", "placed"]} search={<SearchInput label="Search by name, reference or passport last 4 digits" placeholder="Name, VSG-CV-… or 4821…" />}>
                {requirementOptions.length ? <FilterSelect param="requirement" label="Requirement" allLabel="All requirements" options={requirementOptions} /> : null}
                <FilterSelect param="placed" label="Supplied to" allLabel="All workers" options={placedOptions} />
              </FilterBar>
              <FilterPendingRegion className="mt-5">
                <WorkerInvoiceForm
                  key={readiness.organization.id}
                  basePath={WORKER_INVOICES_ADMIN_PATH}
                  organization={{ id: readiness.organization.id, name: readiness.organization.name }}
                  draftId={draft?.invoice.id ?? null}
                  currency={draft?.invoice.currency ?? readiness.billingProfile?.currency ?? null}
                  currencies={currencies}
                  workers={picker?.items ?? []}
                  totalMatches={picker?.total ?? 0}
                  initial={initial}
                  notes={draft?.invoice.notes ?? null}
                  issueBlocked={issueBlocked}
                />
              </FilterPendingRegion>
            </FilterScope>
          </SectionCard>
        </>
      ) : (
        <EmptyState icon={<Users />} title="Choose who pays first" description="Then tick the workers you supplied to them and enter the amount." size="sm" />
      )}
    </div>
  );
}
