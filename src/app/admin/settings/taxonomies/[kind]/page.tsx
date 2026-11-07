import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Tags, Upload } from "lucide-react";
import { z } from "zod";

import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, type AdminFieldSpec } from "@/components/admin/action-form";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { SKILL_CATEGORIES } from "@/db/schema/_constants";
import { parsePage, withParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";

import { DownloadLink } from "../../_components/download-link";
import { SETTINGS_CRUMB } from "../../_components/settings-nav";
import { decideSkillAction, importTaxonomyAction, saveTaxonomyAction, setTaxonomyActiveAction } from "../actions";
import { ImportForm } from "../_components/import-form";
import { isTaxonomyKind, STATIC_OPTIONS, TAXONOMIES, type OptionSource, type TaxonomyKind } from "../_lib/config";
import { getTaxonomyValues, listTaxonomy, loadTaxonomyOptions, type TaxonomyRow } from "../_lib/queries";

type SP = Record<string, string | string[] | undefined>;
type Params = { kind: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: isTaxonomyKind(kind) ? TAXONOMIES[kind].title : "Taxonomy" };
}

const filtersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["active", "inactive", "pending"]).optional().catch(undefined),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  category: z.enum(SKILL_CATEGORIES).optional().catch(undefined),
  edit: z.string().trim().max(64).optional().catch(undefined),
  import: z.literal("1").optional().catch(undefined),
});

export default async function TaxonomyKindPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<SP> }) {
  const ctx = await requireStaff("settings.view");
  const { kind: rawKind } = await params;
  if (!isTaxonomyKind(rawKind)) notFound();
  const kind: TaxonomyKind = rawKind;
  const cfg = TAXONOMIES[kind];
  const sp = await searchParams;
  const f = filtersSchema.parse({ q: sp.q, status: sp.status, country: sp.country, category: sp.category, edit: sp.edit, import: sp.import });
  const page = parsePage(sp, { defaultSize: 50 });
  const canEdit = staffCan(ctx, "settings.taxonomies");
  const pathname = `/admin/settings/taxonomies/${kind}`;
  const listHref = withParams(pathname, sp, { edit: null, import: null });

  const editing = canEdit && f.edit ? (f.edit === "new" ? "new" : await getTaxonomyValues(kind, f.edit)) : null;
  const optionSources = cfg.fields.map((x) => x.options).filter((o): o is OptionSource => Boolean(o));
  const needsCountries = kind === "states";
  const [result, options] = await Promise.all([
    listTaxonomy(kind, { q: f.q, status: f.status, country: f.country, category: f.category }, page),
    editing || needsCountries ? loadTaxonomyOptions(needsCountries ? [...optionSources, "countries"] : optionSources) : Promise.resolve({} as Awaited<ReturnType<typeof loadTaxonomyOptions>>),
  ]);

  const statusOptions = [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    ...(kind === "skills" ? [{ value: "pending", label: "Suggested, awaiting review" }] : []),
  ];

  const formFields = (row: TaxonomyRow | null): AdminFieldSpec[] =>
    cfg.fields
      .filter((field) => !(field.createOnly && row))
      .map((field) => {
        let opts = field.options ? (options[field.options] ?? STATIC_OPTIONS[field.options as keyof typeof STATIC_OPTIONS] ?? []) : undefined;
        // A record cannot be its own parent.
        if (row && field.name === "parentId" && opts) opts = opts.filter((o) => o.value !== row.id);
        const value = row ? row.values[field.name] : field.kind === "checkbox" && field.name === "isActive" ? true : undefined;
        return {
          name: field.name,
          label: field.label,
          kind: field.kind,
          required: field.required,
          optional: !field.required && field.kind !== "checkbox",
          hint: field.hint,
          min: field.min,
          max: field.max,
          options: opts,
          allowClear: !field.required && Boolean(field.options),
          defaultValue: value === undefined ? null : value,
          wide: field.kind === "textarea" || field.kind === "checkbox",
        };
      });

  return (
    <div className="space-y-6">
      <PageHeader
        title={cfg.title}
        description={cfg.description}
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, SETTINGS_CRUMB, { label: "Taxonomies", href: "/admin/settings/taxonomies" }, { label: cfg.title }]}
        actions={[
          ...(canEdit ? [{ label: `Add ${cfg.singular}`, href: withParams(pathname, sp, { edit: "new", import: null }), icon: <Plus aria-hidden /> }] : []),
          <DownloadLink key="export" href={`${pathname}/export`} label="Export CSV" testId="taxonomy-export" />,
          ...(canEdit ? [{ label: "Import CSV", href: withParams(pathname, sp, { import: "1", edit: null }), variant: "outline" as const, icon: <Upload aria-hidden /> }] : []),
        ]}
      />

      {editing ? (
        <SectionCard
          title={editing === "new" ? `Add ${cfg.singular}` : `Edit ${editing.name}`}
          description={kind === "skills" || kind === "job-categories" ? "Renaming or changing synonyms rebuilds candidate and job search text in the background." : undefined}
          action={{ label: "Cancel", href: listHref, variant: "ghost" }}
          id="edit"
        >
          <ActionForm
            action={saveTaxonomyAction}
            hidden={{ kind, recordId: editing === "new" ? undefined : editing.id }}
            fields={formFields(editing === "new" ? null : editing)}
            columns={2}
            submitLabel={editing === "new" ? `Add ${cfg.singular}` : "Save changes"}
            successHref={listHref}
            testId="taxonomy-form"
          />
        </SectionCard>
      ) : f.edit && canEdit ? (
        <EmptyState title="Record not found" description="It may have been changed by someone else." primaryAction={{ label: "Back to the list", href: listHref }} />
      ) : null}

      {f.import && canEdit ? (
        <SectionCard title={`Import ${cfg.title.toLowerCase()}`} action={{ label: "Close", href: listHref, variant: "ghost" }}>
          <p className="mb-4 text-sm text-muted-foreground">
            Columns: {cfg.csv.map(([h]) => <code key={h} className="mr-1 rounded bg-surface-subtle px-1 text-xs">{h}</code>)}. Yes/no columns accept yes, no, true or false.
            {kind === "skills" ? " Separate synonyms with “|”." : ""}
            {kind === "industries" || kind === "job-categories" ? " Parents must exist before their children (put parents first)." : ""}
          </p>
          <ImportForm kind={kind} action={importTaxonomyAction} />
        </SectionCard>
      ) : null}

      <FilterScope>
        <FilterBar paramKeys={["q", "status", "country", "category"]} search={<SearchInput label={cfg.searchHint} />}>
          <FilterSelect param="status" label="Status" allLabel="Any status" options={statusOptions} />
          {kind === "states" ? <FilterSelect param="country" label="Country" allLabel="All countries" options={options.countries ?? []} /> : null}
          {kind === "skills" ? <FilterSelect param="category" label="Category" allLabel="All categories" options={STATIC_OPTIONS.skillCategories} /> : null}
        </FilterBar>
        <FilterChips
          filters={[
            { param: "status", label: "Status", options: statusOptions },
            ...(kind === "skills" ? [{ param: "category", label: "Category", options: STATIC_OPTIONS.skillCategories }] : []),
            ...(kind === "states" ? [{ param: "country", label: "Country", options: options.countries ?? [] }] : []),
          ]}
        />
        <FilterPendingRegion>
          <DataTable
            caption={cfg.title}
            rows={result.items}
            getRowId={(r) => r.id}
            columns={[
              {
                id: "name",
                header: "Name",
                primary: true,
                cell: (r) => (
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{r.name}</p>
                    {r.secondary ? <p className="truncate text-xs text-muted-foreground">{r.secondary}</p> : null}
                  </div>
                ),
              },
              {
                id: "status",
                header: "Status",
                cell: (r) => (
                  <span className="flex flex-wrap gap-1">
                    {r.status === "pending" ? (
                      <StatusBadge tone="warning" size="sm">Suggested</StatusBadge>
                    ) : r.status === "rejected" ? (
                      <StatusBadge tone="danger" size="sm">Rejected</StatusBadge>
                    ) : (
                      <StatusBadge tone={r.isActive ? "success" : "neutral"} size="sm">{r.isActive ? "Active" : "Inactive"}</StatusBadge>
                    )}
                    {r.badges.map((b) => (
                      <StatusBadge key={b} tone="brand" size="sm">
                        {b}
                      </StatusBadge>
                    ))}
                  </span>
                ),
              },
              ...(canEdit
                ? [
                    {
                      id: "actions",
                      header: "Actions",
                      align: "right" as const,
                      cell: (r: TaxonomyRow) => (
                        <span className="flex flex-wrap justify-end gap-2">
                          {r.status === "pending" ? (
                            <>
                              <ActionButton action={decideSkillAction.bind(null, { id: r.id, decision: "approved" })} variant="default" testId={`approve-${r.id}`}>
                                Approve<span className="sr-only"> {r.name}</span>
                              </ActionButton>
                              <ActionButton action={decideSkillAction.bind(null, { id: r.id, decision: "rejected" })} confirm={{ title: `Reject “${r.name}”?`, description: "It will not appear in skill pickers. People who added it keep it on their profile.", confirmLabel: "Reject", destructive: true }}>
                                Reject<span className="sr-only"> {r.name}</span>
                              </ActionButton>
                            </>
                          ) : null}
                          <Button asChild variant="ghost" size="sm">
                            <Link href={withParams(pathname, sp, { edit: r.id, import: null }) + "#edit"}>
                              <Pencil aria-hidden className="size-3.5" /> Edit<span className="sr-only"> {r.name}</span>
                            </Link>
                          </Button>
                          {r.status !== "pending" ? (
                            <ActionButton
                              action={setTaxonomyActiveAction.bind(null, { kind, id: r.id, active: !r.isActive })}
                              confirm={r.isActive ? { title: `Deactivate ${r.name}?`, description: "It disappears from forms and filters. Records that already use it keep it.", confirmLabel: "Deactivate" } : undefined}
                            >
                              {r.isActive ? "Deactivate" : "Activate"}
                              <span className="sr-only"> {r.name}</span>
                            </ActionButton>
                          ) : null}
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
            empty={
              <EmptyState
                icon={<Tags />}
                title={f.q || f.status ? "Nothing matches these filters" : `No ${cfg.title.toLowerCase()} yet`}
                description={f.q || f.status ? "Try a different search or clear the filters." : "Run the reference-data seed, import a CSV or add records one by one."}
                primaryAction={canEdit && !(f.q || f.status) ? { label: `Add ${cfg.singular}`, href: withParams(pathname, sp, { edit: "new" }) } : undefined}
              />
            }
            footer={<Pagination pathname={pathname} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel={cfg.title.toLowerCase()} />}
          />
        </FilterPendingRegion>
      </FilterScope>
      {!canEdit ? <p className="text-sm text-muted-foreground">Editing needs the “Edit taxonomies” permission.</p> : null}
    </div>
  );
}
