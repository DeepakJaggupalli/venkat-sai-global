import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PortalBreadcrumb } from "@/components/layout/portal-breadcrumb";
import { AVAILABILITY_LABELS, formatExperience, formatPlace, labelFor, LANGUAGE_PROFICIENCY_LABELS, parseCompareIds, PASSPORT_STATUS_LABELS } from "@/components/employer-talent/labels";
import { VerificationLevelBadge } from "@/components/employer-talent/verification-level-badge";
import { SALARY_PERIOD_LABELS } from "@/components/employer/labels";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { PageHeader } from "@/components/shared/page-header";
import type { SearchParams } from "@/lib/http";
import type { CandidateView } from "@/modules/candidates/types";
import { getCandidateView } from "@/modules/candidates/viewer";
import { requireOrgMember } from "@/modules/identity/authz";

export const metadata: Metadata = { title: "Compare candidates" };

type Row = { label: string; cell: (v: CandidateView) => ReactNode };

const ROWS: Row[] = [
  { label: "Headline", cell: (v) => v.headline ?? v.currentJobTitle ?? "—" },
  { label: "Verification", cell: (v) => <VerificationLevelBadge level={v.verificationLevel} /> },
  { label: "Location", cell: (v) => formatPlace(v.location) },
  { label: "Experience", cell: (v) => formatExperience(v.totalExperienceMonths) },
  { label: "Availability", cell: (v) => labelFor(AVAILABILITY_LABELS, v.availability, "Not shared") },
  {
    label: "Expected salary",
    cell: (v) =>
      v.expectedSalary ? (
        <>
          <MoneyText amountMinor={v.expectedSalary.amountMinor} currency={v.expectedSalary.currency} /> {labelFor(SALARY_PERIOD_LABELS, v.expectedSalary.period, "").toLowerCase()}
        </>
      ) : (
        "Not shared"
      ),
  },
  { label: "Top skills", cell: (v) => v.skills.slice(0, 8).map((s) => (s.verified ? `${s.name} (verified)` : s.name)).join(", ") || "—" },
  { label: "Languages", cell: (v) => v.languages.map((l) => `${l.name} (${labelFor(LANGUAGE_PROFICIENCY_LABELS, l.proficiency)})`).join(", ") || "—" },
  { label: "Education", cell: (v) => v.education[0]?.qualification ?? v.education[0]?.educationLevel?.name ?? "—" },
  { label: "Venkat Sai assessments passed", cell: (v) => String(v.assessments.filter((a) => a.result === "pass").length) },
  { label: "Verified credentials", cell: (v) => String(v.credentials.filter((c) => c.verificationStatus === "verified").length) },
  { label: "Overseas", cell: (v) => `${v.preferences.openToOverseas ? "Open to overseas work" : "Not looking overseas"} · ${labelFor(PASSPORT_STATUS_LABELS, v.passportStatus, "Passport not shared")}` },
];

export default async function CompareCandidatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireOrgMember("employer", ["employer.candidates.search", "employer.pipeline.view"], "any");
  const sp = await searchParams;
  const ids = parseCompareIds(sp.ids);
  const views = (await Promise.all(ids.map((id) => getCandidateView(id, { kind: "employer", ctx })))).filter((v): v is CandidateView => v !== null);
  const missing = ids.length - views.length;

  return (
    <div className="space-y-6">
      <PortalBreadcrumb items={[{ label: "Find candidates", href: "/employer/candidates" }, { label: "Compare" }]} />
      <PageHeader title="Compare candidates" description="Side by side, using only what each candidate shares with your organisation." backLink={{ href: "/employer/candidates", label: "Back to search" }} />
      {missing > 0 ? <p className="text-sm text-muted-foreground">{missing === 1 ? "One profile is" : `${missing} profiles are`} no longer available to you and not shown.</p> : null}
      {views.length < 2 ? (
        <EmptyState title="Choose at least two candidates" description="Tick “Compare” on up to four candidates in search, then select Compare." primaryAction={{ label: "Go to search", href: "/employer/candidates" }} />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Candidate comparison</caption>
            <thead className="bg-surface-subtle">
              <tr>
                <th scope="col" className="w-44 p-3 font-medium text-muted-foreground">
                  Criterion
                </th>
                {views.map((v) => (
                  <th key={v.candidateId} scope="col" className="p-3 align-top">
                    <Link href={`/employer/candidates/${v.candidateId}`} className="font-heading font-semibold text-teal-strong underline-offset-4 hover:underline">
                      {v.name.display}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="p-3 align-top font-medium text-muted-foreground">
                    {row.label}
                  </th>
                  {views.map((v) => (
                    <td key={v.candidateId} className="p-3 align-top">
                      {row.cell(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
