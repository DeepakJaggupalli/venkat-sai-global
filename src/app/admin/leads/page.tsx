import type { Metadata } from "next";
import { Mail, Users } from "lucide-react";
import { z } from "zod";

import { ActionForm } from "@/components/admin/action-form";
import { listStaffOptions } from "@/components/admin/queries";
import { DataTable } from "@/components/shared/data-table";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { parsePage } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { createLeadAction } from "@/modules/operations/admin-actions";
import {
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_TYPE_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_TYPE_LABELS,
} from "@/modules/operations/constants";
import { enquiryCounts, leadPipelineCounts, listEnquiries, listLeads } from "@/modules/operations/queries";
import { countryOptions, currencyOptions } from "@/modules/taxonomy/queries";

import { LEAD_STATUS_TONE } from "./_lib/tones";

export const metadata: Metadata = { title: "Leads & enquiries" };

type SP = Record<string, string | string[] | undefined>;

const opts = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const PIPELINE: (keyof typeof LEAD_STATUS_LABELS)[] = ["new", "contacted", "qualified", "proposal", "nurturing", "won", "lost"];

const filtersSchema = z.object({
  tab: z.enum(["leads", "enquiries"]).catch("leads").default("leads"),
  status: z.string().max(30).optional().catch(undefined),
  type: z.string().max(30).optional().catch(undefined),
  source: z.enum(Object.keys(LEAD_SOURCE_LABELS) as [keyof typeof LEAD_SOURCE_LABELS]).optional().catch(undefined),
  assignee: z.string().max(40).optional().catch(undefined),
  due: z.enum(["1"]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});

function assignedTo(value: string | undefined, me: string): string | undefined {
  if (!value) return undefined;
  if (value === "me") return me;
  if (value === "unassigned") return "unassigned";
  return z.uuid().safeParse(value).success ? value : undefined;
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaff("leads.view");
  const canManage = staffCan(ctx, "leads.manage");
  const sp = await searchParams;
  const f = filtersSchema.parse({ tab: sp.tab, status: sp.status, type: sp.type, source: sp.source, assignee: sp.assignee, due: sp.due, q: sp.q });
  const page = parsePage(sp, { defaultSize: 25 });
  const staff = await listStaffOptions({ permission: "leads.view" });
  const assigneeOptions = [{ value: "me", label: "Assigned to me" }, { value: "unassigned", label: "Unassigned" }, ...staff];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads & enquiries"
        description="Business prospects from forms, calls and referrals, and every message sent through the website contact form."
        actions={
          canManage && f.tab === "leads" ? (
            <ResponsiveDialog title="New lead" description="Record a prospect you met or spoke to. Only record contact details the person agreed to share." size="lg" trigger={<Button data-testid="new-lead">New lead</Button>}>
              <NewLeadForm />
            </ResponsiveDialog>
          ) : null
        }
      />
      <LinkTabs
        label="Leads and enquiries"
        items={[
          { href: "/admin/leads", label: "Leads", icon: <Users /> },
          { href: "/admin/leads?tab=enquiries", label: "Enquiries", icon: <Mail /> },
        ]}
      />
      {f.tab === "leads" ? (
        <LeadsTab sp={sp} f={f} page={page} me={ctx.user.id} ctx={ctx} assigneeOptions={assigneeOptions} />
      ) : (
        <EnquiriesTab sp={sp} f={f} page={page} me={ctx.user.id} ctx={ctx} assigneeOptions={assigneeOptions} />
      )}
    </div>
  );
}

type TabProps = {
  sp: SP;
  f: z.output<typeof filtersSchema>;
  page: ReturnType<typeof parsePage>;
  me: string;
  ctx: Awaited<ReturnType<typeof requireStaff>>;
  assigneeOptions: { value: string; label: string }[];
};

async function LeadsTab({ sp, f, page, me, ctx, assigneeOptions }: TabProps) {
  const status = f.status === "open" || (f.status && f.status in LEAD_STATUS_LABELS) ? (f.status as keyof typeof LEAD_STATUS_LABELS | "open") : undefined;
  const type = f.type && f.type in LEAD_TYPE_LABELS ? (f.type as keyof typeof LEAD_TYPE_LABELS) : undefined;
  const [result, counts] = await Promise.all([
    listLeads(ctx, { status, type, source: f.source, assignedTo: assignedTo(f.assignee, me), followUpDue: f.due === "1" || undefined, q: f.q }, page),
    leadPipelineCounts(ctx),
  ]);
  const statusOptions = [{ value: "open", label: "All open" }, ...opts(LEAD_STATUS_LABELS)];
  return (
    <div className="space-y-6">
      <nav aria-label="Lead pipeline" className="-mx-1 overflow-x-auto px-1">
        <ol className="flex min-w-max gap-2">
          {PIPELINE.map((s) => (
            <li key={s}>
              <a
                href={`/admin/leads?status=${s}`}
                aria-current={status === s ? "page" : undefined}
                className="flex min-w-28 flex-col rounded-xl border border-border bg-card px-4 py-3 shadow-xs transition-colors hover:border-teal/40 aria-[current=page]:border-teal aria-[current=page]:bg-teal-soft"
              >
                <span className="text-xs font-medium text-muted-foreground">{LEAD_STATUS_LABELS[s]}</span>
                <span className="font-heading text-xl font-semibold text-foreground">{counts[s] ?? 0}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <FilterScope>
        <FilterBar paramKeys={["q", "status", "type", "source", "assignee", "due"]} search={<SearchInput label="Search leads by name, company, email or code" />}>
          <FilterSelect param="status" label="Status" allLabel="Any status" options={statusOptions} />
          <FilterSelect param="type" label="Type" allLabel="All types" options={opts(LEAD_TYPE_LABELS)} />
          <FilterSelect param="source" label="Source" allLabel="All sources" options={opts(LEAD_SOURCE_LABELS)} />
          <FilterSelect param="assignee" label="Owner" allLabel="Anyone" options={assigneeOptions} />
          <FilterSelect param="due" label="Follow-up" allLabel="Any" options={[{ value: "1", label: "Follow-up due" }]} />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "status", label: "Status", options: statusOptions },
            { param: "type", label: "Type", options: opts(LEAD_TYPE_LABELS) },
            { param: "source", label: "Source", options: opts(LEAD_SOURCE_LABELS) },
            { param: "assignee", label: "Owner", options: assigneeOptions },
            { param: "due", label: "Follow-up", options: [{ value: "1", label: "Due" }] },
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption="Leads"
            rows={result.items}
            getRowId={(l) => l.id}
            rowLink={(l) => ({ href: `/admin/leads/${l.id}`, label: `Open lead ${l.code}: ${l.name}` })}
            columns={[
              {
                id: "name",
                header: "Lead",
                primary: true,
                cell: (l) => (
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{l.organizationName ?? l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.code} · {l.organizationName ? `${l.name} · ` : ""}
                      {LEAD_TYPE_LABELS[l.type]}
                    </p>
                  </div>
                ),
              },
              { id: "status", header: "Status", cell: (l) => <StatusBadge tone={LEAD_STATUS_TONE[l.status]} size="sm">{LEAD_STATUS_LABELS[l.status]}</StatusBadge> },
              { id: "source", header: "Source", hideOnMobile: true, cell: (l) => LEAD_SOURCE_LABELS[l.source] },
              { id: "owner", header: "Owner", hideOnMobile: true, cell: (l) => l.assigneeName ?? <span className="text-muted-foreground">Unassigned</span> },
              {
                id: "followUp",
                header: "Next follow-up",
                nowrap: true,
                cell: (l) =>
                  l.nextFollowUpAt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <DateText value={l.nextFollowUpAt} mode="datetime" />
                      {l.nextFollowUpAt.getTime() < Date.now() ? <StatusBadge tone="warning" size="sm">Due</StatusBadge> : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  ),
              },
              { id: "created", header: "Created", hideOnMobile: true, cell: (l) => <RelativeTime value={l.createdAt} /> },
            ]}
            empty={<EmptyState icon={<Users />} title="No leads match" description="Leads arrive from employer, partner and institution enquiries, or add one yourself." />}
            footer={<Pagination pathname="/admin/leads" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="leads" />}
          />
        </FilterPendingRegion>
      </FilterScope>
    </div>
  );
}

async function EnquiriesTab({ sp, f, page, me, ctx, assigneeOptions }: TabProps) {
  const status = f.status === "open" || (f.status && f.status in ENQUIRY_STATUS_LABELS) ? (f.status as keyof typeof ENQUIRY_STATUS_LABELS | "open") : undefined;
  const type = f.type && f.type in ENQUIRY_TYPE_LABELS ? (f.type as keyof typeof ENQUIRY_TYPE_LABELS) : undefined;
  const [result, counts] = await Promise.all([listEnquiries(ctx, { status, type, assignedTo: assignedTo(f.assignee, me), q: f.q }, page), enquiryCounts(ctx)]);
  const statusOptions = [{ value: "open", label: "All open" }, ...opts(ENQUIRY_STATUS_LABELS)];
  return (
    <FilterScope>
      <p className="text-sm text-muted-foreground">
        {counts.new ?? 0} new · {counts.in_progress ?? 0} in progress · {counts.responded ?? 0} responded
      </p>
      <FilterBar paramKeys={["q", "status", "type", "assignee"]} search={<SearchInput label="Search enquiries" />}>
        <FilterSelect param="status" label="Status" allLabel="Any status" options={statusOptions} />
        <FilterSelect param="type" label="Type" allLabel="All types" options={opts(ENQUIRY_TYPE_LABELS)} />
        <FilterSelect param="assignee" label="Owner" allLabel="Anyone" options={assigneeOptions} />
      </FilterBar>
      <FilterPendingRegion>
        <DataTable
          caption="Enquiries"
          rows={result.items}
          getRowId={(e) => e.id}
          rowLink={(e) => ({ href: `/admin/leads/enquiries/${e.id}`, label: `Open enquiry ${e.code}` })}
          columns={[
            {
              id: "subject",
              header: "Enquiry",
              primary: true,
              cell: (e) => (
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{e.subject ?? ENQUIRY_TYPE_LABELS[e.type]}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.code} · {e.name}
                    {e.organizationName ? ` · ${e.organizationName}` : ""}
                  </p>
                </div>
              ),
            },
            { id: "type", header: "Type", cell: (e) => ENQUIRY_TYPE_LABELS[e.type] },
            { id: "status", header: "Status", cell: (e) => <StatusBadge status={e.status} size="sm">{ENQUIRY_STATUS_LABELS[e.status]}</StatusBadge> },
            { id: "owner", header: "Owner", hideOnMobile: true, cell: (e) => e.assigneeName ?? <span className="text-muted-foreground">Unassigned</span> },
            { id: "received", header: "Received", nowrap: true, cell: (e) => <RelativeTime value={e.createdAt} /> },
          ]}
          empty={<EmptyState icon={<Mail />} title="No enquiries match" description="Messages from the website contact form appear here." />}
          footer={<Pagination pathname="/admin/leads" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="enquiries" />}
        />
      </FilterPendingRegion>
    </FilterScope>
  );
}

async function NewLeadForm() {
  const [countries, currencies] = await Promise.all([countryOptions(), currencyOptions()]);
  return (
    <ActionForm
      action={createLeadAction}
      successHref="/admin/leads/{id}"
      columns={2}
      testId="new-lead-form"
      fields={[
        { name: "type", label: "Lead type", kind: "select", required: true, options: opts(LEAD_TYPE_LABELS), defaultValue: "employer" },
        { name: "source", label: "Source", kind: "select", required: true, options: opts(LEAD_SOURCE_LABELS), defaultValue: "phone" },
        { name: "name", label: "Contact name", required: true },
        { name: "designation", label: "Designation", optional: true },
        { name: "organizationName", label: "Organisation", optional: true },
        { name: "email", label: "Email", kind: "email", optional: true },
        { name: "phone", label: "Phone", kind: "tel", optional: true, hint: "Include the country code, e.g. +91" },
        { name: "countryCode", label: "Country", kind: "search-select", options: countries, optional: true, allowClear: true },
        { name: "city", label: "City", optional: true },
        { name: "estimatedValue", label: "Estimated value", kind: "number", optional: true, min: 0, step: "0.01" },
        { name: "estimatedValueCurrency", label: "Currency", kind: "search-select", options: currencies, optional: true, allowClear: true, hint: "Required with an estimated value" },
        { name: "nextFollowUpAt", label: "Next follow-up", kind: "datetime-local", optional: true },
        { name: "interest", label: "What they need", kind: "textarea", optional: true },
        { name: "consentToContact", label: "The contact agreed to be contacted by Venkat Sai", kind: "checkbox", wide: true },
      ]}
      submitLabel="Create lead"
      pendingLabel="Creating…"
    />
  );
}
