import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowUpDown } from "lucide-react";
import { z } from "zod";

import { CreateEntryButton } from "@/components/cms/create-entry-button";
import { EntryTable, type EntryRow } from "@/components/cms/entry-table";
import { ReorderList } from "@/components/cms/reorder-list";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterChips, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SectionCard } from "@/components/shared/section-card";
import type { CmsCollection } from "@/db/schema";
import { parsePage, withParams } from "@/lib/http";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { getCollection, isCmsCollection } from "@/modules/content/collections";
import { CMS_ENTRY_STATUS_LABELS, CMS_ENTRY_STATUS_VALUES, CONTENT_LOCALE_LABELS, CONTENT_LOCALE_VALUES } from "@/modules/content/constants";
import { CONTENT_ADMIN_PATHS } from "@/modules/content/links";
import { getSingletonForEditing, listEntries, listEntryTags } from "@/modules/content/queries";
import { entryListFiltersSchema } from "@/modules/content/schemas";

import { loadEditorData } from "../_lib/editor-data";
import { EntryEditorView } from "../_lib/entry-view";

type Params = Promise<{ collection: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

const localeSchema = z.enum(CONTENT_LOCALE_VALUES).catch("en");
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { collection } = await params;
  return { title: isCmsCollection(collection) ? getCollection(collection).label : "Content" };
}

const localeOptions = CONTENT_LOCALE_VALUES.map((l) => ({ value: l, label: CONTENT_LOCALE_LABELS[l] }));
const statusOptions = CMS_ENTRY_STATUS_VALUES.map((s) => ({ value: s, label: CMS_ENTRY_STATUS_LABELS[s] }));

export default async function CollectionPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const ctx = await requireStaff("content.view");
  const { collection: raw } = await params;
  if (!isCmsCollection(raw)) notFound();
  const collection = raw as CmsCollection;
  const def = getCollection(collection);
  const sp = await searchParams;
  const base = CONTENT_ADMIN_PATHS.collection(collection);
  const crumbs = [
    { label: "Command Centre", href: "/admin" },
    { label: "Content", href: CONTENT_ADMIN_PATHS.content },
  ];

  // Singletons: the collection page IS the editor (one entry per language).
  if (def.singleton) {
    const locale = localeSchema.parse(one(sp.locale));
    const detail = await getSingletonForEditing(ctx, collection, locale);
    const tabs = (
      <LinkTabs
        label="Language"
        items={CONTENT_LOCALE_VALUES.map((l) => ({ href: l === "en" ? base : `${base}?locale=${l}`, label: CONTENT_LOCALE_LABELS[l] }))}
        activeHref={locale === "en" ? base : `${base}?locale=${locale}`}
      />
    );
    if (!detail) {
      return (
        <div className="space-y-6">
          <PageHeader title={def.label} description={def.description} breadcrumbs={[...crumbs, { label: def.label }]} />
          {tabs}
          <EmptyState
            title={`${def.label} is not set up${locale !== "en" ? ` in ${CONTENT_LOCALE_LABELS[locale]}` : ""}`}
            description={
              locale === "en"
                ? "The website shows its built-in defaults until this page is created and published."
                : "Visitors using this language see the English version until a translation is published."
            }
            primaryAction={staffCan(ctx, "content.edit") ? <CreateEntryButton collection={collection} singularLabel={def.singularLabel} locale={locale} fixedTitle={def.label} label={`Create ${def.label.toLowerCase()}`} /> : undefined}
          />
        </div>
      );
    }
    const data = await loadEditorData(ctx, detail);
    return (
      <div className="space-y-4">
        {tabs}
        <EntryEditorView data={data} title={def.label} breadcrumbs={[...crumbs, { label: def.label }]} />
      </div>
    );
  }

  // Reorder mode: the whole collection (one language) in its manual order.
  const canPublish = staffCan(ctx, "content.publish");
  if (one(sp.reorder) === "1" && canPublish) {
    const locale = localeSchema.parse(one(sp.locale));
    const all = await listEntries(ctx, { collection, locale, sort: "manual" }, { page: 1, pageSize: 500, offset: 0 });
    return (
      <div className="space-y-6">
        <PageHeader title={`Reorder ${def.label.toLowerCase()}`} description="Set the order in which entries appear on the website." breadcrumbs={[...crumbs, { label: def.label, href: base }, { label: "Reorder" }]} />
        <LinkTabs label="Language" items={CONTENT_LOCALE_VALUES.map((l) => ({ href: `${base}?reorder=1&locale=${l}`, label: CONTENT_LOCALE_LABELS[l] }))} activeHref={`${base}?reorder=1&locale=${locale}`} />
        <SectionCard title={`${all.items.length} ${all.items.length === 1 ? "entry" : "entries"}`}>
          {all.items.length < 2 ? (
            <EmptyState size="sm" variant="plain" title="Nothing to reorder" description="Add at least two entries in this language first." />
          ) : (
            <ReorderList collection={collection} items={all.items.map((e) => ({ id: e.id, title: e.title, status: e.status }))} doneHref={base} />
          )}
        </SectionCard>
      </div>
    );
  }

  const tab = one(sp.status) ?? (one(sp.deleted) === "1" ? "bin" : "all");
  const filters = entryListFiltersSchema.safeParse({
    collection,
    status: one(sp.status),
    locale: one(sp.locale),
    q: one(sp.q),
    tag: one(sp.tag),
    featured: one(sp.featured),
    deleted: one(sp.deleted) === "1" ? "true" : undefined,
    sort: one(sp.sort) ?? (def.defaultSort === "manual" ? "manual" : undefined),
  });
  const parsed = filters.success ? filters.data : { collection };
  const page = parsePage(sp, { defaultSize: 25 });
  const [result, tags] = await Promise.all([listEntries(ctx, parsed, page), listEntryTags(ctx, collection)]);
  const tagOptions = tags.map((t) => ({ value: t, label: t }));
  const rows: EntryRow[] = result.items.map((e) => ({
    id: e.id,
    collection: e.collection,
    title: e.title,
    slug: e.slug,
    locale: e.locale,
    status: e.status,
    hasUnpublishedChanges: e.hasUnpublishedChanges,
    isFeatured: e.isFeatured,
    publishAt: e.publishAt?.toISOString() ?? null,
    scheduledVersion: e.scheduledVersion,
    consentStatus: e.consentStatus,
    updatedAt: e.updatedAt.toISOString(),
    updatedByName: e.updatedByName,
    deleted: e.deletedAt !== null,
  }));
  const filtered = Boolean(parsed.q || parsed.status || parsed.locale || parsed.tag || parsed.featured || parsed.deleted);

  return (
    <div className="space-y-6">
      <PageHeader
        title={def.label}
        description={def.description}
        breadcrumbs={[...crumbs, { label: def.label }]}
        actions={[
          ...(canPublish && def.defaultSort === "manual" ? [{ label: "Reorder", href: `${base}?reorder=1`, variant: "outline" as const, icon: <ArrowUpDown aria-hidden /> }] : []),
          ...(staffCan(ctx, "content.edit") ? [<CreateEntryButton key="new" collection={collection} singularLabel={def.singularLabel} />] : []),
        ]}
      />
      {def.consentRequired && (
        <p className="rounded-lg border bg-info-soft/60 px-4 py-3 text-sm">
          Every {def.singularLabel.toLowerCase()} needs recorded consent evidence before it can be published, and publication always goes through the approval centre so a second person checks the evidence.
        </p>
      )}

      <LinkTabs
        label="Entry status"
        items={[
          { href: base, label: "All" },
          { href: `${base}?status=published`, label: "Published" },
          { href: `${base}?status=draft`, label: "Drafts" },
          { href: `${base}?status=scheduled`, label: "Scheduled" },
          { href: `${base}?status=archived`, label: "Archived" },
          { href: `${base}?deleted=1`, label: "Bin" },
        ]}
        activeHref={tab === "bin" ? `${base}?deleted=1` : tab === "all" ? base : `${base}?status=${tab}`}
      />

      <FilterScope>
        <FilterBar paramKeys={["q", "status", "locale", "tag", "featured"]} search={<SearchInput label={`Search ${def.label.toLowerCase()}`} />}>
          <FilterSelect param="status" label="Status" allLabel="Any status" options={statusOptions} />
          <FilterSelect param="locale" label="Language" allLabel="All languages" options={localeOptions} />
          {tagOptions.length > 0 && <FilterSelect param="tag" label="Tag" allLabel="Any tag" options={tagOptions} />}
          <FilterSelect param="featured" label="Featured" allLabel="Featured or not" options={[{ value: "true", label: "Featured only" }]} />
        </FilterBar>
        <FilterChips
          filters={[
            { param: "status", label: "Status", options: statusOptions },
            { param: "locale", label: "Language", options: localeOptions },
            { param: "tag", label: "Tag" },
            { param: "featured", label: "Featured", options: [{ value: "true", label: "Yes" }] },
          ]}
        />
        <FilterPendingRegion>
          <EntryTable
            rows={rows}
            canPublish={canPublish}
            consentRequired={def.consentRequired}
            approvalCollection={Boolean(def.approvalType)}
            sort={{ by: parsed.sort ?? "updated", dir: "desc", pathname: base, searchParams: sp }}
            empty={
              filtered ? (
                <EmptyState title="No entries match" description="Try other filters or clear them." primaryAction={{ label: "Clear filters", href: base, variant: "outline" }} />
              ) : (
                <EmptyState
                  title={`No ${def.label.toLowerCase()} yet`}
                  description={def.consentRequired ? "Add real, verified stories only, with the written consent of the people or organisations featured." : "Create the first entry. It stays a draft until you publish it."}
                  primaryAction={staffCan(ctx, "content.edit") ? <CreateEntryButton collection={collection} singularLabel={def.singularLabel} /> : undefined}
                />
              )
            }
            footer={
              result.pageCount > 1 ? (
                <Pagination pathname={base} searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="entries" />
              ) : undefined
            }
          />
        </FilterPendingRegion>
      </FilterScope>
      {result.total > 0 && parsed.sort === "manual" && canPublish && (
        <p className="text-sm text-muted-foreground">
          Shown in website order.{" "}
          <a href={withParams(base, {}, { reorder: 1 })} className="font-medium text-teal-strong underline-offset-2 hover:underline">
            Change the order
          </a>
        </p>
      )}
    </div>
  );
}
