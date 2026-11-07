import { BadgeCheck, CircleSlash, Clock3, SearchX } from "lucide-react";

import { DateText } from "@/components/shared/date-text";
import { KeyValueList } from "@/components/shared/key-value-list";
import { StatusBadge } from "@/components/shared/status-badge";
import type { PublicCertificateVerification } from "@/modules/training/types";

import type { Translate } from "./course-text";
import { certificateTone, joinPlace } from "./training-rules";

/**
 * Minimal public verification result: holder, title, issuer and issuer type, issue / expiry dates and the
 * status (valid / revoked / expired). Works in server and client components (no hooks).
 */
export function VerificationResult({ t, result, fmtLocale }: { t: Translate; result: PublicCertificateVerification; fmtLocale: string }) {
  if (!result.found) {
    return (
      <div role="status" data-testid="verification-result" className="flex gap-3 rounded-xl border border-border bg-card p-5">
        <SearchX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <h2 className="font-heading font-semibold text-navy">{t("verify.notFoundTitle")}</h2>
          <p className="mt-1 text-sm text-foreground/80">{t("verify.notFoundBody")}</p>
        </div>
      </div>
    );
  }
  const Icon = result.status === "valid" ? BadgeCheck : result.status === "revoked" ? CircleSlash : Clock3;
  const details = joinPlace([result.details.courseTitle, result.details.trade, result.details.process, result.details.position]);
  return (
    <section role="status" aria-labelledby="verification-result-title" data-testid="verification-result" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className={result.status === "valid" ? "flex items-start gap-3 bg-success-soft p-5" : result.status === "revoked" ? "flex items-start gap-3 bg-danger-soft p-5" : "flex items-start gap-3 bg-warning-soft p-5"}>
        <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0" />
        <div className="min-w-0">
          <h2 id="verification-result-title" className="font-heading text-lg font-semibold text-navy">
            {t(`verify.status.${result.status}.title`)}
          </h2>
          <p className="mt-1 text-sm text-foreground/80">{t(`verify.status.${result.status}.body`)}</p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <KeyValueList
          columns={2}
          emptyText={t("common.notProvided")}
          items={[
            { key: "holder", label: t("verify.holder"), value: result.holderName },
            { key: "title", label: t("verify.titleField"), value: result.title },
            { key: "issuer", label: t("verify.issuer"), value: result.issuerName },
            {
              key: "status",
              label: t("verify.statusLabel"),
              value: (
                <StatusBadge size="sm" tone={certificateTone(result.status)}>
                  {t(`certificateStatus.${result.status}`)}
                </StatusBadge>
              ),
            },
            { key: "issued", label: t("verify.issuedOn"), value: <DateText value={result.issuedOn} dateOnly locale={fmtLocale} /> },
            { key: "expires", label: t("verify.expiresOn"), value: result.expiresOn ? <DateText value={result.expiresOn} dateOnly locale={fmtLocale} /> : t("verify.noExpiry") },
            ...(details ? [{ key: "details", label: t("verify.details"), value: details, fullWidth: true }] : []),
            ...(result.accreditationBody ? [{ key: "body", label: t("verify.awardingBody"), value: result.accreditationBody, fullWidth: true }] : []),
            { key: "code", label: t("verify.certificateNumber"), value: <span className="font-mono">{result.code}</span> },
          ]}
        />
        <p className="rounded-lg bg-surface-subtle p-3 text-sm text-foreground/80">
          <span className="font-medium text-navy">{t("verify.issuerType")}: </span>
          {t(`issuerType.${result.issuerType}`)}
        </p>
      </div>
    </section>
  );
}
