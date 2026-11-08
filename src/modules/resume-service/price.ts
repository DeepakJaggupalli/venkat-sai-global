/**
 * Resume service price display (client-safe). The price is data (`resume_service.price`, amount in minor units +
 * currency, edited on /admin/resume-requests); 0 or no currency = "Price on request".
 */
import { formatMoney } from "@/lib/format";

import type { ResumeServicePrice } from "./schemas";

export const PRICE_ON_REQUEST = "Price on request";

export function hasFixedPrice(price: ResumeServicePrice | null | undefined): price is ResumeServicePrice {
  return Boolean(price && price.amountMinor > 0 && /^[A-Z]{3}$/.test(price.currency));
}

export function resumePriceLabel(price: ResumeServicePrice | null | undefined): string {
  return hasFixedPrice(price) ? formatMoney(price.amountMinor, price.currency) : PRICE_ON_REQUEST;
}

/** Price stored on a request row (null amount = on request). */
export function requestPriceLabel(amountMinor: number | null, currency: string | null): string {
  return resumePriceLabel(amountMinor !== null && currency ? { amountMinor, currency } : null);
}
