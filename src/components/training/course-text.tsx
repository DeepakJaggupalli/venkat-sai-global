import type { ReactNode } from "react";

import { MoneyText } from "@/components/shared/money-text";
import type { CourseCertificationType, CourseFeeType } from "@/db/schema/training";

/** Translator shape shared by getT() (server) and useT() (client). */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** "6 weeks · 120 hours", "40 hours" or null when no duration is stated. */
export function durationText(t: Translate, course: { durationWeeks: number | null; durationHours: number | null }): string | null {
  const parts: string[] = [];
  if (course.durationWeeks) parts.push(t("duration.weeks", { count: course.durationWeeks }));
  if (course.durationHours) parts.push(t("duration.hours", { count: course.durationHours }));
  return parts.length ? parts.join(" · ") : null;
}

export function certificationLabel(t: Translate, type: CourseCertificationType): string {
  return t(`certification.${type}`);
}

/** The course fee in its own currency (never assumed), "Free" or "Fee on request". */
export function FeeText({
  t,
  feeType,
  feeMinor,
  feeCurrency,
  locale,
  className,
}: {
  t: Translate;
  feeType: CourseFeeType;
  feeMinor: number | null;
  feeCurrency: string | null;
  locale: string;
  className?: string;
}): ReactNode {
  if (feeType === "free") return <span className={className}>{t("fee.free")}</span>;
  if (feeType === "fixed" && feeMinor !== null && feeCurrency) return <MoneyText amountMinor={feeMinor} currency={feeCurrency} locale={locale} className={className} />;
  return <span className={className}>{t("fee.onRequest")}</span>;
}
