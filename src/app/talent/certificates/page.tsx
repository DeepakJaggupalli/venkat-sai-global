import { Award, ExternalLink } from "lucide-react";
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
import { getFiles, toFileSummary } from "@/modules/files";
import { certificateLapsesAt, listCandidateCertificates } from "@/modules/training/certificates";
import type { CandidateCertificateItem } from "@/modules/training/types";

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
  const [t, locale, certificates] = await Promise.all([
    getT("talent-training"),
    getLocale(),
    listCandidateCertificates({ userId: user.id, candidateId: candidate.id, displayName: user.displayName }),
  ]);
  const fmt = intlLocale(locale);
  const now = new Date();
  const fileIds = certificates.map((c) => c.fileId).filter((id): id is string => !!id);
  const files = new Map((fileIds.length ? await getFiles(fileIds) : []).map((f) => [f.id, toFileSummary(f)]));

  return (
    <div className="space-y-6">
      <PageHeader title={t("certificates.title")} description={t("certificates.description")} />
      <p className="max-w-3xl text-sm text-muted-foreground">{t("certificates.honesty")}</p>

      {certificates.length === 0 ? (
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
