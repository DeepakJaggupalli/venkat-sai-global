import { FilePlus2, GraduationCap, PenLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { FileUpload } from "@/components/files";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterPendingRegion, FilterScope, FilterSelect, SearchInput } from "@/components/shared/filters";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { RelativeTime } from "@/components/shared/relative-time";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { parsePage, sp, type SearchParams } from "@/lib/http";
import { DOCUMENT_KIND_LABELS, DOCUMENT_ORIGIN_LABELS, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_TONE, DOCUMENTS_ADMIN_PATH, INTERNSHIPS_ADMIN_PATH, ISSUED_DOCUMENT_KINDS, ISSUED_DOCUMENT_STATUSES } from "@/modules/documents/content";
import { countDocumentsByStatus, ensureAutoDocumentsQuietly, getDocumentSignatory, listDocuments } from "@/modules/documents/service";
import { requireStaff } from "@/modules/identity/authz";
import { getSetting } from "@/modules/settings";

import { BulkSelect } from "./_components/bulk-select";
import { approveDocumentsAction, createDocumentAction, saveSignatoryAction, saveSignatureImageAction } from "./actions";

export const metadata: Metadata = { title: "Certificates and letters" };

function pickEnum<T extends readonly string[]>(value: string | undefined, values: T): T[number] | undefined {
  return value && (values as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

/**
 * Certificates and letters for trainees and interns (training.certificates): everything waiting for approval first,
 * with "approve selected"; search; the signatory and signature printed on every document; make one by hand.
 */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireStaff("training.certificates");
  await ensureAutoDocumentsQuietly();
  const params = await searchParams;
  const page = parsePage(params);
  const requested = sp(params, "status");
  const status = requested === "all" ? undefined : (pickEnum(requested, ISSUED_DOCUMENT_STATUSES) ?? "pending");
  const kind = pickEnum(sp(params, "kind"), ISSUED_DOCUMENT_KINDS);
  const q = sp(params, "q")?.slice(0, 100);
  const [result, counts, signatory, signatureId] = await Promise.all([
    listDocuments(ctx, { status, kind, q }, page),
    countDocumentsByStatus(),
    getDocumentSignatory(),
    getSetting("documents.signature_file_id"),
  ]);
  const tabs: { key: string; label: string; n?: number }[] = [
    ...ISSUED_DOCUMENT_STATUSES.map((s) => ({ key: s, label: DOCUMENT_STATUS_LABELS[s], n: counts[s] })),
    { key: "all", label: "All" },
  ];
  const current = requested === "all" ? "all" : (status ?? "pending");
  const kindOptions = ISSUED_DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] }));

  const rows = result.items.map((d) => ({
    id: d.id,
    content: (
      <div className="flex flex-wrap items-start justify-between gap-3" data-testid="document-row">
        <div className="min-w-0">
          <Link href={`${DOCUMENTS_ADMIN_PATH}/${d.id}`} className="font-medium text-navy underline-offset-4 hover:underline">
            {d.holderName}
          </Link>
          <p className="text-sm text-muted-foreground">
            {DOCUMENT_KIND_LABELS[d.kind]} · {d.programme || "No course or internship name yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {d.code} · {DOCUMENT_ORIGIN_LABELS[d.origin]} · <RelativeTime value={d.createdAt} />
            {d.requestNote ? ` · Note: “${d.requestNote.slice(0, 80)}”` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge size="sm" tone={DOCUMENT_STATUS_TONE[d.status]}>
            {DOCUMENT_STATUS_LABELS[d.status]}
          </StatusBadge>
          <a href={`${DOCUMENTS_ADMIN_PATH}/${d.id}/pdf`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-teal-strong underline-offset-4 hover:underline">
            View PDF
          </a>
          <Link href={`${DOCUMENTS_ADMIN_PATH}/${d.id}`} className="text-sm font-medium text-navy underline-offset-4 hover:underline">
            {d.status === "pending" ? "Check and edit" : "Open"}
          </Link>
        </div>
      </div>
    ),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificates and letters"
        description="Course certificates, internship offer letters, internship certificates and letters of recommendation (LOR). They are made automatically and wait here for your approval. After approval the person can download theirs, and you can send it on WhatsApp or email."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Certificates and letters" }]}
        actions={[{ label: "Interns", href: INTERNSHIPS_ADMIN_PATH, icon: <GraduationCap /> }]}
      />

      <ol className="grid gap-3 text-sm sm:grid-cols-3">
        {[
          ["1. Made automatically", "When someone finishes a Venkat Sai course, starts an internship or finishes one. People can also ask from their account."],
          ["2. You check and approve", "Open one to read and edit every line, or tick many and approve them together."],
          ["3. They download it", "From their account, or from the link you send on WhatsApp or email. Anyone can check it with the QR code."],
        ].map(([title, body]) => (
          <li key={title} className="rounded-xl border border-border bg-card p-4">
            <p className="font-semibold text-navy">{title}</p>
            <p className="mt-1 text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>

      <nav aria-label="Document status" className="-mx-1 overflow-x-auto px-1">
        <ol className="flex min-w-max gap-2">
          {tabs.map((t) => (
            <li key={t.key}>
              <a
                href={`${DOCUMENTS_ADMIN_PATH}?status=${t.key}`}
                aria-current={current === t.key ? "page" : undefined}
                className="flex min-w-32 flex-col rounded-xl border border-border bg-card px-4 py-3 shadow-xs transition-colors hover:border-teal/40 aria-[current=page]:border-teal aria-[current=page]:bg-teal-soft"
              >
                <span className="text-xs font-medium text-muted-foreground">{t.label}</span>
                <span className="font-heading text-xl font-semibold text-foreground">{t.n ?? counts.pending + counts.approved + counts.rejected + counts.revoked}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <FilterScope>
        <FilterBar paramKeys={["q", "kind"]} search={<SearchInput label="Search by name, phone, email, reference or course" />}>
          <FilterSelect param="kind" label="Type" allLabel="All types" options={kindOptions} />
        </FilterBar>
        <FilterPendingRegion>
          {rows.length ? (
            <BulkSelect
              label="documents"
              testId="documents-list"
              rows={rows}
              actions={current === "pending" ? [{ label: "Approve selected", action: approveDocumentsAction, confirm: "Approve {n} document(s)? The people can then download them.", testId: "approve-selected" }] : []}
            />
          ) : (
            <EmptyState
              icon={<FilePlus2 />}
              title={current === "pending" ? "Nothing is waiting for approval" : "No documents here"}
              description={current === "pending" ? "New certificates and letters appear here when someone finishes a course or an internship, or asks for one." : "Try another tab or search."}
              primaryAction={{ label: "Add interns", href: INTERNSHIPS_ADMIN_PATH }}
            />
          )}
          <Pagination pathname={DOCUMENTS_ADMIN_PATH} searchParams={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="documents" />
        </FilterPendingRegion>
      </FilterScope>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Who signs" description="Printed under the signature line on every new certificate and letter.">
          <ActionForm
            action={saveSignatoryAction}
            submitLabel="Save signatory"
            columns={2}
            fields={[
              { name: "name", label: "Name", optional: true, defaultValue: signatory.name, placeholder: "e.g. the owner's full name", hint: "Leave empty to print only the title." },
              { name: "title", label: "Title", defaultValue: signatory.title, placeholder: "e.g. Director" },
              { name: "place", label: "Place", defaultValue: signatory.place },
            ]}
            testId="signatory-form"
          />
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <PenLine aria-hidden="true" className="size-4" />
              Signature image {signatureId ? <StatusBadge size="sm" tone="success">Saved</StatusBadge> : <StatusBadge size="sm" tone="neutral">None, sign by hand</StatusBadge>}
            </h3>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">Sign on white paper, take a clear photo (or scan), and upload it as PNG or JPG. It is printed on every certificate and letter.</p>
            <ActionForm action={saveSignatureImageAction} submitLabel="Save signature image" testId="signature-form">
              <FileUpload purpose="certificate" name="fileId" label="Choose the image" description="PNG or JPG of the signature, up to 10 MB." />
            </ActionForm>
            {signatureId ? (
              <div className="mt-3">
                <ActionForm action={saveSignatureImageAction} hidden={{ remove: "true" }} submitLabel="Remove signature image" submitVariant="outline" />
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Make a document by hand" description="For someone who is not in the list, for example a past trainee. It starts with standard wording that you can edit.">
          <ActionForm
            action={createDocumentAction}
            submitLabel="Create and edit"
            columns={2}
            successHref={`${DOCUMENTS_ADMIN_PATH}/{id}`}
            fields={[
              { name: "kind", label: "Type", kind: "select", options: kindOptions, defaultValue: "internship_certificate" },
              { name: "holderName", label: "Name (as printed)", placeholder: "Full name in English letters" },
              { name: "programme", label: "Course or internship", placeholder: "e.g. Welding inspection internship", wide: true },
              { name: "role", label: "Role or track", optional: true, placeholder: "e.g. Quality control intern" },
              { name: "holderPhone", label: "WhatsApp number", kind: "tel", optional: true },
              { name: "holderEmail", label: "Email", kind: "email", optional: true },
              { name: "startDate", label: "Start date", kind: "date", optional: true },
              { name: "endDate", label: "End date", kind: "date", optional: true },
            ]}
            testId="create-document-form"
          />
        </SectionCard>
      </div>
    </div>
  );
}
