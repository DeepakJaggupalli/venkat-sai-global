import { formatMoney, formatSalaryRange } from "@/lib/format";
import { cn } from "@/lib/utils";

type MoneyTextProps = {
  /** Integer minor units (paise, fils, cents…) exactly as stored. */
  amountMinor: number | null | undefined;
  /** ISO 4217 code of the record — never assume INR. */
  currency: string | null | undefined;
  locale?: string;
  /** Shown when the amount or currency is missing. */
  fallback?: string;
  /** Use tabular figures (for amounts aligned in table columns). */
  tabular?: boolean;
  className?: string;
};

/**
 * Formats a stored money amount with its own currency.
 *
 *   <MoneyText amountMinor={invoice.totalMinor} currency={invoice.currency} />
 */
export function MoneyText({ amountMinor, currency, locale, fallback = "—", tabular = false, className }: MoneyTextProps) {
  const missing = amountMinor === null || amountMinor === undefined || !currency;
  return (
    <span data-slot="money-text" className={cn(tabular && "tabular-nums", missing && "text-muted-foreground", className)}>
      {missing ? fallback : formatMoney(amountMinor, currency, locale)}
    </span>
  );
}

type SalaryRangeTextProps = {
  minMinor: number | null | undefined;
  maxMinor: number | null | undefined;
  currency: string | null | undefined;
  /** salary period, e.g. "month" → "/ month". */
  period?: string | null;
  locale?: string;
  /** Shown when no salary is disclosed. */
  fallback?: string;
  className?: string;
};

/** "AED 2,500 – 3,200 / month" — respects the record's currency and period. */
export function SalaryRangeText({ minMinor, maxMinor, currency, period, locale, fallback = "Not disclosed", className }: SalaryRangeTextProps) {
  const text = formatSalaryRange(minMinor, maxMinor, currency, period, locale);
  return (
    <span data-slot="salary-range" className={cn(!text && "text-muted-foreground", className)}>
      {text ?? fallback}
    </span>
  );
}
