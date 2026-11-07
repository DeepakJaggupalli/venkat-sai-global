import { VerificationBadge } from "@/components/shared/verification-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import type { TFunction } from "@/i18n/server";

/** Per-item verification status in the candidate's language (rejected items show the reason given by staff). */
export function ItemStatus({ status, reason, t }: { status: string; reason?: string | null; t: TFunction }) {
  if (status === "rejected") {
    return (
      <span className="inline-flex flex-col gap-1">
        <StatusBadge tone="danger" size="sm">
          {t("verification.rejected")}
        </StatusBadge>
        {reason ? <span className="text-sm text-danger-strong">{t("verification.reason", { reason })}</span> : null}
      </span>
    );
  }
  const key = status === "verified" ? "verified" : status === "pending" ? "pending" : "unverified";
  return (
    <span className="inline-flex flex-col gap-1">
      <VerificationBadge state={key === "pending" ? "pending_review" : key} label={t(`verification.${key}`)} description={t(`verification.${key}.hint`)} />
      {reason && status === "unverified" ? <span className="text-sm text-warning-strong">{t("verification.changesRequested", { reason })}</span> : null}
    </span>
  );
}

/** "Mar 2021 – Present" for month-precision career dates. */
export function periodText(start: string | null, end: string | null, isCurrent: boolean, t: TFunction, locale: string): string {
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const from = start ? fmt(start) : null;
  const to = isCurrent ? t("history.present") : end ? fmt(end) : null;
  if (from && to) return `${from} – ${to}`;
  return from ?? to ?? "";
}

export function dateText(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}
