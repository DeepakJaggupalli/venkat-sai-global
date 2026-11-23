/**
 * Requirement alerts (pure, client-safe): which subscriptions want a poster and what the notification says.
 */

export type AlertPoster = {
  slug: string;
  title: string;
  countryCode: string | null;
  countryName: string | null;
  trades: { trade: string; salary?: string | null; currency?: string | null }[];
};

export type AlertFilters = { trades: readonly string[]; countryCodes: readonly string[] };

export type PushMessage = { title: string; body: string; url: string; tag: string };

/**
 * A subscription without filters gets every poster. With filters, the poster must be for one of the chosen
 * countries and list a matching trade. A poster that does not state its country (or lists no trades) cannot be
 * ruled out, so it is sent rather than silently missed.
 */
export function posterMatchesFilters(poster: AlertPoster, filters: AlertFilters): boolean {
  if (filters.countryCodes.length && poster.countryCode && !filters.countryCodes.includes(poster.countryCode)) return false;
  if (filters.trades.length) {
    const names = poster.trades.map((t) => t.trade.trim().toLowerCase()).filter(Boolean);
    if (names.length && !filters.trades.some((f) => names.some((n) => n.includes(f) || f.includes(n)))) return false;
  }
  return true;
}

function pay(salary: string | null | undefined, currency: string | null | undefined): string | null {
  const s = salary?.trim();
  if (!s) return null;
  const c = currency?.trim().toUpperCase();
  return c && !s.toUpperCase().includes(c) ? `${s} ${c}` : s;
}

/** "New requirement: Saudi Arabia" / "Welder - 1500 SAR (+2 more trades)", opening /requirements/<slug>. */
export function requirementAlert(poster: AlertPoster): PushMessage {
  const trades = poster.trades.filter((t) => t.trade.trim());
  const first = trades[0];
  let body = poster.title;
  if (first) {
    const salary = pay(first.salary, first.currency);
    body = `${first.trade.trim()}${salary ? ` - ${salary}` : ""}`;
    if (trades.length > 1) body += ` (+${trades.length - 1} more ${trades.length === 2 ? "trade" : "trades"})`;
  }
  return {
    title: poster.countryName ? `New requirement: ${poster.countryName}` : "New requirement",
    body: body.slice(0, 180),
    url: `/requirements/${poster.slug}`,
    tag: `requirement-${poster.slug}`.slice(0, 64),
  };
}
