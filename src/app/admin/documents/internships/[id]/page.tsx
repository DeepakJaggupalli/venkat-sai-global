import { CheckCheck, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/admin/action-button";
import { ActionForm } from "@/components/admin/action-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DOCUMENT_KIND_LABELS, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_TONE, DOCUMENTS_ADMIN_PATH, INTERN_STATUS_LABELS, INTERNSHIPS_ADMIN_PATH } from "@/modules/documents/content";
import { getVenkatSaiProgramme } from "@/modules/documents/service";
import { requireStaff } from "@/modules/identity/authz";

import { BulkSelect } from "../../_components/bulk-select";
import { addInternAction, addInternsBulkAction, approveProgrammeDocumentsAction, setInternStatusAction, updateInternAction } from "../../actions";

export const metadata: Metadata = { title: "Internship programme" };

const SHORT_KIND = { internship_offer_letter: "Offer letter", internship_certificate: "Certificate", recommendation_letter: "LOR", course_certificate: "Course certificate" } as const;
const STATUS_TONE = { applied: "info", active: "warning", completed: "success", dropped: "neutral", rejected: "neutral" } as const;

/** One programme: the interns (tick many and mark them finished), their documents, and adding interns one by one or many at once. */
export default async function ProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff("training.certificates");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getVenkatSaiProgramme(ctx, id);
  if (!data) notFound();
  const { programme, interns } = data;
  const waiting = interns.reduce((n, i) => n + i.documents.filter((d) => d.status === "pending").length, 0);

  const rows = interns.map((i) => ({
    id: i.id,
    content: (
      <div className="space-y-2" data-testid="intern-row">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-navy">{i.fullName}</p>
            <p className="text-sm text-muted-foreground">{[i.track, i.institutionName, i.phone, i.email].filter(Boolean).join(" · ") || "No contact details yet"}</p>
            <p className="text-xs text-muted-foreground">{[i.startsOn ? `From ${i.startsOn}` : null, i.endsOn ? `to ${i.endsOn}` : null, i.candidateId ? "Has a People account" : null].filter(Boolean).join(" ")}</p>
          </div>
          <StatusBadge size="sm" tone={STATUS_TONE[i.status]}>
            {INTERN_STATUS_LABELS[i.status]}
          </StatusBadge>
        </div>
        {i.documents.length ? (
          <ul className="flex flex-wrap gap-2">
            {i.documents.map((d) => (
              <li key={d.id}>
                <Link href={`${DOCUMENTS_ADMIN_PATH}/${d.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs hover:border-teal/50">
                  {SHORT_KIND[d.kind]}
                  <StatusBadge size="sm" tone={DOCUMENT_STATUS_TONE[d.status]}>
                    {DOCUMENT_STATUS_LABELS[d.status]}
                  </StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Edit details and the words for the LOR</summary>
          <div className="mt-3">
            <ActionForm
              action={updateInternAction}
              hidden={{ id: i.id, programmeId: programme.id }}
              submitLabel="Save"
              columns={2}
              fields={[
                { name: "fullName", label: "Name (as printed)", defaultValue: i.fullName },
                { name: "track", label: "Role or track", optional: true, defaultValue: i.track ?? "" },
                { name: "phone", label: "WhatsApp number", kind: "tel", optional: true, defaultValue: i.phone ?? "" },
                { name: "email", label: "Email", kind: "email", optional: true, defaultValue: i.email ?? "" },
                { name: "institutionName", label: "College", optional: true, defaultValue: i.institutionName ?? "" },
                { name: "startsOn", label: "Start date", kind: "date", optional: true, defaultValue: i.startsOn ?? "" },
                { name: "endsOn", label: "End date", kind: "date", optional: true, defaultValue: i.endsOn ?? "" },
                { name: "performanceNote", label: "How they did (used in the LOR)", kind: "textarea", optional: true, rows: 3, wide: true, defaultValue: i.performanceNote ?? "", placeholder: "e.g. Ravi learned radiography film reading quickly and prepared clear inspection reports." },
              ]}
            />
          </div>
        </details>
      </div>
    ),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={programme.title}
        eyebrow="Internship programme"
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Certificates and letters", href: DOCUMENTS_ADMIN_PATH }, { label: "Interns", href: INTERNSHIPS_ADMIN_PATH }, { label: programme.title }]}
        actions={
          waiting ? (
            <ActionButton action={approveProgrammeDocumentsAction.bind(null, { programmeId: programme.id })} variant="default" size="default" icon={<CheckCheck aria-hidden="true" />} confirm={{ title: `Approve ${waiting} waiting document(s)?`, description: "Everyone in this programme can then download theirs. Check one or two previews first.", confirmLabel: "Approve all" }} testId="approve-programme">
              Approve all {waiting} waiting
            </ActionButton>
          ) : undefined
        }
      />

      {rows.length ? (
        <BulkSelect
          label="interns"
          testId="intern-list"
          rows={rows}
          actions={[
            { label: "Mark finished", action: setInternStatusAction, extra: { status: "completed", programmeId: programme.id }, confirm: "Mark {n} intern(s) as finished? Their certificate and LOR will be made for your approval.", testId: "mark-finished" },
            { label: "Doing it now", action: setInternStatusAction, extra: { status: "active", programmeId: programme.id }, variant: "outline" },
            { label: "Left early", action: setInternStatusAction, extra: { status: "dropped", programmeId: programme.id }, variant: "outline", confirm: "Mark {n} intern(s) as left early?" },
          ]}
        />
      ) : (
        <EmptyState icon={<UserPlus />} title="No interns yet" description="Add them below, one by one or many at once." />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Add many at once" description="One person per line: name, then WhatsApp number, email and college in any order (only the name is needed). You can paste from Excel.">
          <ActionForm
            action={addInternsBulkAction}
            hidden={{ programmeId: programme.id }}
            submitLabel="Add interns"
            resetOnSuccess
            testId="bulk-interns-form"
            fields={[
              { name: "lines", label: "Interns", kind: "textarea", rows: 7, placeholder: "Ravi Kumar, 9876543210, ravi@example.com, GITAM University\nSita Devi, +91 91234 56789" },
              { name: "track", label: "Role or track for all", optional: true, placeholder: "e.g. Welding inspection intern" },
              { name: "startsOn", label: "Start date for all", kind: "date", optional: true, defaultValue: programme.startsOn ?? "" },
              { name: "endsOn", label: "End date for all", kind: "date", optional: true },
            ]}
          />
        </SectionCard>
        <SectionCard title="Add one intern" description="If they already finished, choose “Finished” and the certificate and LOR are made straight away.">
          <ActionForm
            action={addInternAction}
            hidden={{ programmeId: programme.id }}
            submitLabel="Add intern"
            columns={2}
            resetOnSuccess
            testId="add-intern-form"
            fields={[
              { name: "fullName", label: "Name (as printed)", placeholder: "Full name in English letters" },
              {
                name: "status",
                label: "Status",
                kind: "select",
                options: [
                  { value: "active", label: "Doing the internship" },
                  { value: "completed", label: "Finished" },
                ],
                defaultValue: "active",
              },
              { name: "phone", label: "WhatsApp number", kind: "tel", optional: true },
              { name: "email", label: "Email", kind: "email", optional: true },
              { name: "institutionName", label: "College", optional: true },
              { name: "track", label: "Role or track", optional: true },
              { name: "startsOn", label: "Start date", kind: "date", optional: true, defaultValue: programme.startsOn ?? "" },
              { name: "endsOn", label: "End date", kind: "date", optional: true },
              { name: "performanceNote", label: "How they did (used in the LOR)", kind: "textarea", optional: true, rows: 2, wide: true },
            ]}
          />
        </SectionCard>
      </div>
      <p className="text-sm text-muted-foreground">
        Types made for each intern: {DOCUMENT_KIND_LABELS.internship_offer_letter} (when added), {DOCUMENT_KIND_LABELS.internship_certificate} and {DOCUMENT_KIND_LABELS.recommendation_letter} (when finished). If an intern has a People account with the same email or phone, the documents also appear in their account.
      </p>
    </div>
  );
}
