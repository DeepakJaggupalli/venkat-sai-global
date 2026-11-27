import { GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DOCUMENTS_ADMIN_PATH, INTERNSHIPS_ADMIN_PATH } from "@/modules/documents/content";
import { listVenkatSaiProgrammes } from "@/modules/documents/service";
import { requireStaff, staffCan } from "@/modules/identity/authz";
import { currencyOptions } from "@/modules/taxonomy/queries";

import { createProgrammeAction } from "../actions";

export const metadata: Metadata = { title: "Interns" };

const WORK_MODE_LABELS = { remote: "Online", on_site: "At our workshop", hybrid: "Online and at the workshop" } as const;

/** Venkat Sai's own internship programmes (online or on site) and how many interns each has. */
export default async function InternshipsPage() {
  const ctx = await requireStaff("training.certificates");
  const canCreate = staffCan(ctx, "training.manage");
  const [programmes, currencies] = await Promise.all([listVenkatSaiProgrammes(ctx), canCreate ? currencyOptions() : Promise.resolve([])]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interns"
        description="Make a programme once (for example “Online welding inspection internship, December batch”), add the interns, and mark them finished. Offer letters, certificates and LORs are made for you and wait for your approval."
        breadcrumbs={[{ label: "Command Centre", href: "/admin" }, { label: "Certificates and letters", href: DOCUMENTS_ADMIN_PATH }, { label: "Interns" }]}
      />

      {programmes.length ? (
        <ul className="grid gap-4 lg:grid-cols-2" data-testid="programme-list">
          {programmes.map((p) => (
            <li key={p.id}>
              <Link href={`${INTERNSHIPS_ADMIN_PATH}/${p.id}`} className="block h-full rounded-xl border border-border bg-card p-5 transition-colors hover:border-teal/50 hover:bg-teal-soft/30">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-heading text-base font-semibold text-navy">{p.title}</h2>
                  <StatusBadge size="sm" tone={p.status === "open" ? "success" : "neutral"}>
                    {p.status === "open" ? "Running" : p.status}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[p.workMode ? WORK_MODE_LABELS[p.workMode] : null, p.durationWeeks ? `${p.durationWeeks} weeks` : null, p.startsOn ? `starts ${p.startsOn}` : null].filter(Boolean).join(" · ") || "No details yet"}
                </p>
                <p className="mt-3 text-sm">
                  <span className="font-semibold">{p.interns}</span> interns · <span className="font-semibold">{p.active}</span> doing it now · <span className="font-semibold">{p.completed}</span> finished
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<GraduationCap />} title="No internship programmes yet" description="Create the first one below, then add your interns." />
      )}

      {canCreate ? (
        <SectionCard title="New internship programme" description="Only the name and stipend type are needed. You can add interns straight after.">
          <ActionForm
            action={createProgrammeAction}
            submitLabel="Create programme"
            columns={2}
            successHref={`${INTERNSHIPS_ADMIN_PATH}/{id}`}
            testId="create-programme-form"
            fields={[
              { name: "title", label: "Programme name", placeholder: "e.g. Online welding inspection internship", wide: true },
              { name: "workMode", label: "Where", kind: "select", options: Object.entries(WORK_MODE_LABELS).map(([value, label]) => ({ value, label })), defaultValue: "remote" },
              { name: "durationWeeks", label: "Length (weeks)", kind: "number", optional: true, min: 1, max: 260 },
              { name: "startsOn", label: "Start date", kind: "date", optional: true },
              {
                name: "stipendType",
                label: "Stipend",
                kind: "select",
                options: [
                  { value: "unpaid", label: "Unpaid" },
                  { value: "fixed", label: "Paid (fixed amount)" },
                  { value: "not_disclosed", label: "Do not mention" },
                ],
                defaultValue: "unpaid",
              },
              { name: "stipendAmount", label: "Stipend amount", kind: "number", optional: true, step: "0.01", hint: "Only for a paid internship." },
              { name: "stipendCurrency", label: "Currency", kind: "select", optional: true, options: currencies, defaultValue: "INR" },
              {
                name: "stipendPeriod",
                label: "Paid every",
                kind: "select",
                optional: true,
                options: [
                  { value: "month", label: "Month" },
                  { value: "week", label: "Week" },
                  { value: "project", label: "Once, for the whole internship" },
                ],
              },
              { name: "description", label: "What interns do (optional, for your records)", kind: "textarea", optional: true, rows: 3, wide: true },
            ]}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
