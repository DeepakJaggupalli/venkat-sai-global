import { Award, Download, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FileLink } from "@/components/files";
import { CopyButton } from "@/components/shared/copy-button";
import { DateText } from "@/components/shared/date-text";
import { EmptyState } from "@/components/shared/empty-state";
import { KeyValueList } from "@/components/shared/key-value-list";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { certificateTone, intlLocale, verificationPath, type CertificateDisplayState } from "@/components/training/training-rules";
import { getLocale, getT } from "@/i18n/server";
import { absoluteUrl } from "@/lib/env";
import { documentPdfPath, listCandidateDocuments } from "@/modules/documents/service";
import { getFiles, toFileSummary } from "@/modules/files";
import { certificateLapsesAt, listCandidateCertificates } from "@/modules/training/certificates";
import type { CandidateCertificateItem } from "@/modules/training/types";

import { RequestDocumentForm } from "./request-document-form";
import { VisibilityToggle } from "./visibility-toggle";
import { requireOnboardedCandidate } from "../_lib/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("talent-training");
  return { title: t("certificates.title") };
}

function displayState(cert: CandidateCertificateItem, now: Date): CertificateDisplayState {
  if (cert.status === "revoked") return "revoked";
  if (cert.status === "expired" || (cert.expiresAt && certificateLapsesAt(cert.expiresAt) < now)) return "expired";
  return "valid";
}

/** The candidate's certificates: issuer type, status, verification code and share link, public check switch, download. */
export default async function CertificatesPage() {
  const { user, candidate } = await requireOnboardedCandidate();
  const [t, locale, certificates, letters] = await Promise.all([
    getT("talent-training"),
    getLocale(),
    listCandidateCertificates({ userId: user.id, candidateId: candidate.id, displayName: user.displayName }),
    // Never let the letters section break the certificates page.
    listCandidateDocuments(candidate.id).catch(() => ({ documents: [], requestOptions: [] })),
  ]);
  const hasLetters = letters.documents.length > 0 || letters.requestOptions.length > 0;
  const fmt = intlLocale(locale);
  const now = new Date();
  const fileIds = certificates.map((c) => c.fileId).filter((id): id is string => !!id);
  const files = new Map((fileIds.length ? await getFiles(fileIds) : []).map((f) => [f.id, toFileSummary(f)]));

  return (
    <div className="space-y-6">
      <PageHeader title={t("certificates.title")} description={t("certificates.description")} />
      <p className="max-w-3xl text-sm text-muted-foreground">{t("certificates.honesty")}</p>

      {hasLetters ? (
        <section aria-labelledby="letters-title" className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6" data-testid="my-documents">
          <div>
            <h2 id="letters-title" className="font-heading text-lg font-semibold text-navy">
              {t("documents.title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("documents.description")}</p>
          </div>
          {letters.documents.length ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {letters.documents.map((d) => {
                const pdf = documentPdfPath(d.verificationCode);
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid="my-document">
                    <div className="min-w-0">
                      <p className="font-medium text-navy">{t(`documents.kind.${d.kind}`)}</p>
                      <p className="text-sm text-muted-foreground">
                        {d.programme} · {t("documents.reference")} <span className="font-mono">{d.code}</span>
                      </p>
                      {d.status === "pending" ? <p className="text-xs text-muted-foreground">{t("documents.pendingHint")}</p> : null}
                      {d.status === "rejected" && d.rejectedReason ? (
                        <p className="text-xs text-danger-strong">
                          {t("documents.reason")}: {d.rejectedReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge size="sm" tone={d.status === "approved" ? "success" : d.status === "pending" ? "warning" : "neutral"}>
                        {t(`documents.status.${d.status}`)}
                      </StatusBadge>
                      {d.status === "approved" ? (
                        <>
                          <a
                            href={`${pdf}?download=1`}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-navy px-3 text-sm font-semibold text-white hover:bg-navy-deep"
                            data-testid="my-document-download"
                          >
                            <Download aria-hidden="true" className="size-4" />
                            {t("documents.download")}
                          </a>
                          <CopyButton value={absoluteUrl(pdf)} label={t("documents.copyLink")} showLabel size="sm" variant="outline" />
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {letters.requestOptions.length ? (
            <div className="space-y-3 rounded-xl bg-surface-subtle p-4">
              <div>
                <h3 className="font-semibold text-navy">{t("documents.requestTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("documents.requestIntro")}</p>
              </div>
              <RequestDocumentForm
                choices={letters.requestOptions.map((o) => ({
                  value: `${o.source}:${o.sourceId}`,
                  label: o.programme,
                  kinds: o.kinds.map((k) => ({ value: k, label: t(`documents.kind.${k}`) })),
                }))}
                labels={{ forLabel: t("documents.requestFor"), kind: t("documents.requestKind"), note: t("documents.requestNote"), submit: t("documents.requestSubmit"), done: t("documents.requested") }}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {certificates.length === 0 && hasLetters ? null : certificates.length === 0 ? (
        <EmptyState
          icon={<Award />}
          title={t("certificates.emptyTitle")}
          description={t("certificates.emptyDescription")}
          primaryAction={{ label: t("talent.findCourses"), href: "/talent/training/courses" }}
          secondaryAction={{ label: t("talent.viewAssessments"), href: "/talent/assessments", variant: "outline" }}
        />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {certificates.map((cert) => {
            const state = displayState(cert, now);
            const file = cert.fileId ? files.get(cert.fileId) : undefined;
            const sharePath = verificationPath(cert.verificationCodeDisplay);
            const shareable = state === "valid" && cert.publicVerificationEnabled;
            return (
              <li key={cert.id} className="flex">
                <article data-testid="certificate-card" aria-labelledby={`cert-${cert.id}`} className="flex w-full flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 id={`cert-${cert.id}`} className="font-heading text-base font-semibold text-navy">
                        {cert.title}
                      </h2>
                      <p className="text-sm text-muted-foreground">{cert.issuerName}</p>
                    </div>
                    <StatusBadge size="sm" tone={certificateTone(state)}>
                      {t(`certificateStatus.${state}`)}
                    </StatusBadge>
                  </div>
                  <p className="rounded-lg bg-surface-subtle p-3 text-sm text-foreground/80">
                    <span className="font-medium text-navy">{t("verify.issuerType")}: </span>
                    {t(`issuerType.${cert.issuerType}`)}
                    {cert.accreditationBody ? ` (${cert.accreditationBody})` : ""}
                  </p>
                  <KeyValueList
                    columns={2}
                    dense
                    emptyText={t("common.notProvided")}
                    items={[
                      { key: "issued", label: t("verify.issuedOn"), value: <DateText value={cert.issuedAt} dateOnly locale={fmt} /> },
                      { key: "expires", label: t("verify.expiresOn"), value: cert.expiresAt ? <DateText value={cert.expiresAt} dateOnly locale={fmt} /> : t("verify.noExpiry") },
                      { key: "number", label: t("verify.certificateNumber"), value: <span className="font-mono">{cert.code}</span> },
                      {
                        key: "code",
                        label: t("certificates.verificationCode"),
                        value: (
                          <span className="inline-flex items-center gap-1">
                            <span className="font-mono" data-testid="verification-code">
                              {cert.verificationCodeDisplay}
                            </span>
                            <CopyButton value={cert.verificationCodeDisplay} label={t("certificates.verificationCode")} />
                          </span>
                        ),
                      },
                      ...(state === "revoked" && cert.revokedReason ? [{ key: "reason", label: t("certificates.revokedReason"), value: cert.revokedReason, fullWidth: true }] : []),
                    ]}
                  />
                  <div className="mt-auto space-y-3 border-t border-border pt-3">
                    {state !== "revoked" ? <VisibilityToggle certificateId={cert.id} enabled={cert.publicVerificationEnabled} /> : null}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {shareable ? (
                        <>
                          <Link href={sharePath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-strong underline-offset-4 hover:underline">
                            <ExternalLink aria-hidden="true" className="size-4" />
                            {t("certificates.openCheck")}
                            <span className="sr-only"> ({t("certificates.newTab")})</span>
                          </Link>
                          <CopyButton value={absoluteUrl(sharePath)} label={t("certificates.shareLink")} showLabel size="sm" variant="outline" />
                        </>
                      ) : null}
                      {file ? (
                        <FileLink file={file} download>
                          {t("certificates.download")}
                        </FileLink>
                      ) : (
                        <span className="text-sm text-muted-foreground">{t("certificates.noFile")}</span>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
