import { Wallet } from "lucide-react";

import type { CourseFeeType } from "@/db/schema/training";

import { FeeText, type Translate } from "./course-text";

/**
 * How a course fee is paid. Shown only for courses with a fee. Offline payment instructions appear only while
 * online payments are off; learners are told to pay only after their place is confirmed, and that fees are
 * never a condition for applying to jobs (CONVENTIONS 15.1).
 */
export function FeePaymentNote({
  t,
  feeType,
  feeMinor,
  feeCurrency,
  fmtLocale,
  providerIsVenkatSai,
  providerName,
  onlinePayments,
  venkatSaiInstructions,
}: {
  t: Translate;
  feeType: CourseFeeType;
  feeMinor: number | null;
  feeCurrency: string | null;
  fmtLocale: string;
  providerIsVenkatSai: boolean;
  providerName: string;
  onlinePayments: boolean;
  venkatSaiInstructions: string | null;
}) {
  if (feeType === "free") return null;
  return (
    <section aria-labelledby="fee-payment-title" data-testid="fee-payment-note" className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 id="fee-payment-title" className="flex items-center gap-2 font-heading text-base font-semibold text-navy">
        <Wallet aria-hidden="true" className="size-4 text-teal-strong" />
        {t("payment.title")}
      </h2>
      <p className="text-sm">
        <span className="text-muted-foreground">{t("facts.fee")}: </span>
        <FeeText t={t} feeType={feeType} feeMinor={feeMinor} feeCurrency={feeCurrency} locale={fmtLocale} className="font-semibold text-navy" />
      </p>
      <p className="text-sm text-foreground/80">{t("payment.afterConfirmation", { provider: providerName })}</p>
      {!onlinePayments && providerIsVenkatSai && venkatSaiInstructions ? (
        <div className="rounded-lg bg-surface-subtle p-3">
          <p className="text-sm font-medium text-navy">{t("payment.offlineInstructions")}</p>
          <p className="mt-1 text-sm whitespace-pre-line text-foreground/80">{venkatSaiInstructions}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("payment.referenceHint")}</p>
        </div>
      ) : !onlinePayments && !providerIsVenkatSai ? (
        <p className="text-sm text-foreground/80">{t("payment.institutionInstructions", { provider: providerName })}</p>
      ) : null}
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>{t("payment.payOnlyConfirmed")}</li>
        <li>{t("payment.neverForJobs")}</li>
      </ul>
    </section>
  );
}
