import { Infinity as InfinityIcon } from "lucide-react";

import { DateText } from "@/components/shared/date-text";
import { MoneyText } from "@/components/shared/money-text";
import { cn } from "@/lib/utils";
import type { EntitlementUsage } from "@/modules/commercial/entitlements-impl";
import type { MoneyByCurrency } from "@/modules/commercial/types";

import { usageLevel, usagePercent } from "./plan-utils";

/** Serialisable subset of EntitlementUsage used by the meters. */
export type UsageItem = Pick<EntitlementUsage, "key" | "label" | "mode" | "included" | "limit" | "used" | "remaining" | "period" | "windowEnd" | "balance">;

const BAR: Record<"ok" | "high" | "full", string> = { ok: "bg-teal", high: "bg-warning", full: "bg-danger" };

/**
 * Usage against plan limits. Counted keys show used / limit with a bar; credit keys show the balance.
 * Text always states the numbers, so colour is never the only signal.
 */
export function UsageMeters({ items, enforced, timeZone }: { items: readonly UsageItem[]; enforced: boolean; timeZone?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Your organisation has no plan limits to show yet.</p>;
  return (
    <div className="space-y-4">
      {!enforced ? (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">Plan limits are shown for information. They are not blocking anything at the moment.</p>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => {
          const unlimited = item.included && item.limit === null;
          const pct = item.mode === "counted" ? usagePercent(item.used, item.limit) : null;
          const level = item.mode === "counted" ? usageLevel(item.used, item.limit) : "ok";
          return (
            <li key={item.key} className="rounded-lg border bg-background p-4" data-testid={`usage-${item.key}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                {unlimited ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-strong">
                    <InfinityIcon className="size-3.5" aria-hidden="true" />
                    Unlimited
                  </span>
                ) : null}
              </div>
              {!item.included ? (
                <p className="mt-2 text-sm text-muted-foreground">Not included in your plan</p>
              ) : item.mode === "credit" ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  <span className="font-heading text-2xl font-semibold text-foreground tabular-nums">{unlimited ? "—" : (item.balance ?? item.remaining ?? 0)}</span>{" "}
                  {unlimited ? "no credit limit" : "credits available"}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <span className="font-heading text-2xl font-semibold text-foreground tabular-nums">{item.used}</span>
                    {item.limit !== null ? <> of {item.limit} used</> : <> in use</>}
                  </p>
                  {pct !== null ? (
                    <div
                      className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={`${item.label} used`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                      aria-valuetext={`${item.used} of ${item.limit}`}
                    >
                      <div className={cn("h-full rounded-full transition-[width]", BAR[level], pctClass(pct))} />
                    </div>
                  ) : null}
                  {level === "full" ? <p className="mt-2 text-xs font-medium text-danger-strong">Limit reached</p> : null}
                </>
              )}
              {item.included && item.windowEnd ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Resets on <DateText value={item.windowEnd} timeZone={timeZone} />
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Width classes in 5 % steps (no inline styles: CSP-friendly). */
const WIDTHS = ["w-0", "w-[5%]", "w-[10%]", "w-[15%]", "w-[20%]", "w-[25%]", "w-[30%]", "w-[35%]", "w-[40%]", "w-[45%]", "w-[50%]", "w-[55%]", "w-[60%]", "w-[65%]", "w-[70%]", "w-[75%]", "w-[80%]", "w-[85%]", "w-[90%]", "w-[95%]", "w-full"];
function pctClass(pct: number): string {
  return WIDTHS[Math.min(20, Math.max(0, Math.round(pct / 5)))]!;
}

/** Amounts per currency — never summed across currencies. */
export function MoneyByCurrencyList({ items, empty = "None" }: { items: readonly MoneyByCurrency[]; empty?: string }) {
  if (!items.length) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <ul className="space-y-0.5">
      {items.map((m) => (
        <li key={m.currency}>
          <MoneyText amountMinor={m.amountMinor} currency={m.currency} />
        </li>
      ))}
    </ul>
  );
}
