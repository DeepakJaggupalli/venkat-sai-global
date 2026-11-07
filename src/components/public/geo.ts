/**
 * Pure geography helpers for the Global Reach visuals and grouping (client-safe, no data access).
 *
 * Coordinates are approximate country centroids (public geographic facts) used only to place decorative
 * markers on an abstract map. Countries without an entry fall back to their region's centre.
 */

import type { MarketRegion } from "@/db/schema/_constants";

/** Visakhapatnam, Andhra Pradesh — Venkat Sai headquarters. */
export const HQ_COORDS = { lon: 83.22, lat: 17.69 } as const;

const COUNTRY_COORDS: Readonly<Record<string, readonly [lon: number, lat: number]>> = {
  IN: [78, 22], AE: [54, 24], SA: [45, 24], QA: [51.2, 25.3], KW: [47.8, 29.3], OM: [57, 21], BH: [50.5, 26],
  JO: [36, 31], IL: [35, 31.5], LB: [35.8, 33.9], IQ: [44, 33], TR: [35, 39], EG: [30, 27], YE: [48, 15.5],
  DE: [10, 51], PL: [19, 52], RO: [25, 46], HU: [19, 47], CZ: [15, 50], SK: [19.5, 48.7], MT: [14.4, 35.9],
  GB: [-2, 54], IE: [-8, 53], NL: [5, 52], BE: [4.5, 50.6], FR: [2, 46], IT: [12, 42], PT: [-8, 39.5],
  ES: [-4, 40], HR: [16, 45], RS: [21, 44], GR: [22, 39], CY: [33, 35], AT: [14, 47.5], CH: [8.2, 46.8],
  SE: [16, 62], NO: [9, 61], FI: [26, 63], DK: [10, 56], LT: [24, 55.2], LV: [25, 57], EE: [25, 58.6],
  BG: [25.5, 42.7], SI: [15, 46.1], LU: [6.1, 49.8], RU: [40, 56], UA: [31, 49],
  SG: [103.8, 1.35], MY: [102, 4], JP: [138, 36], KR: [128, 36], CN: [104, 35], TH: [101, 15], VN: [106, 16],
  ID: [118, -2], PH: [122, 12], LK: [80.7, 7.9], NP: [84, 28], BD: [90, 24], MV: [73.5, 4], BN: [114.7, 4.5],
  HK: [114.2, 22.3], TW: [121, 23.7],
  AU: [134, -25], NZ: [172, -41], PG: [145, -6], FJ: [178, -17.8],
  CA: [-100, 56], US: [-98, 39], MX: [-102, 23],
  BR: [-52, -10], AR: [-64, -34], CL: [-71, -33], CO: [-74, 4], PE: [-75, -9.5],
  ZA: [25, -29], NG: [8, 9], KE: [38, 0], TZ: [35, -6], MU: [57.5, -20.2], GH: [-1, 8], ET: [39, 9],
  UG: [32, 1.3], MZ: [35, -18], AO: [17.5, -12.3], ZM: [27.8, -13.1], DZ: [3, 28], MA: [-7, 32], LY: [17, 27],
  SC: [55.5, -4.7],
};

const REGION_CENTRES: Readonly<Record<MarketRegion, readonly [number, number]>> = {
  india: [78, 22],
  gcc: [50, 25],
  middle_east: [38, 32],
  europe: [12, 50],
  asia_pacific: [112, 12],
  africa: [20, 4],
  north_america: [-100, 42],
  latin_america: [-60, -15],
  oceania: [140, -26],
};

/** The groups shown on /global-reach, in display order (spec: India, GCC, Europe, Asia-Pacific, Africa, North America, other). */
export const REACH_GROUPS = ["india", "gcc", "europe", "asia_pacific", "africa", "north_america", "other"] as const;
export type ReachGroup = (typeof REACH_GROUPS)[number];

export const REACH_GROUP_LABELS: Record<ReachGroup, string> = {
  india: "India",
  gcc: "GCC",
  europe: "Europe",
  asia_pacific: "Asia-Pacific",
  africa: "Africa",
  north_america: "North America",
  other: "Other regions",
};

export function reachGroupFor(region: string | null | undefined): ReachGroup {
  return (REACH_GROUPS as readonly string[]).includes(region ?? "") && region !== "other" ? (region as ReachGroup) : "other";
}

/** Groups items by reach group, keeping the input order inside each group and dropping empty groups. */
export function groupByReach<T>(items: readonly T[], regionOf: (item: T) => string | null | undefined): { group: ReachGroup; label: string; items: T[] }[] {
  const buckets = new Map<ReachGroup, T[]>();
  for (const item of items) {
    const group = reachGroupFor(regionOf(item));
    const list = buckets.get(group) ?? [];
    list.push(item);
    buckets.set(group, list);
  }
  return REACH_GROUPS.filter((g) => buckets.has(g)).map((group) => ({ group, label: REACH_GROUP_LABELS[group], items: buckets.get(group) ?? [] }));
}

export function coordsFor(countryCode: string | null | undefined, region?: string | null): { lon: number; lat: number } | null {
  const code = countryCode?.toUpperCase();
  const exact = code ? COUNTRY_COORDS[code] : undefined;
  if (exact) return { lon: exact[0], lat: exact[1] };
  const centre = region && region in REGION_CENTRES ? REGION_CENTRES[region as MarketRegion] : undefined;
  return centre ? { lon: centre[0], lat: centre[1] } : null;
}

/** Map frame used by every map visual: longitudes −130…180, latitudes 66…−46 (equirectangular). */
export const MAP_FRAME = { minLon: -130, maxLon: 180, maxLat: 66, minLat: -46, width: 1000 } as const;
export const MAP_HEIGHT = Math.round(((MAP_FRAME.maxLat - MAP_FRAME.minLat) / (MAP_FRAME.maxLon - MAP_FRAME.minLon)) * MAP_FRAME.width);

export function project(point: { lon: number; lat: number }): { x: number; y: number } {
  const lon = Math.min(Math.max(point.lon, MAP_FRAME.minLon), MAP_FRAME.maxLon);
  const lat = Math.min(Math.max(point.lat, MAP_FRAME.minLat), MAP_FRAME.maxLat);
  const x = ((lon - MAP_FRAME.minLon) / (MAP_FRAME.maxLon - MAP_FRAME.minLon)) * MAP_FRAME.width;
  const y = ((MAP_FRAME.maxLat - lat) / (MAP_FRAME.maxLat - MAP_FRAME.minLat)) * MAP_HEIGHT;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

/** A gently raised quadratic arc between two projected points (SVG path data). */
export function arcPath(from: { x: number; y: number }, to: { x: number; y: number }, lift = 0.28): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return `M${from.x} ${from.y}`;
  // Perpendicular offset, always bending "up" (towards smaller y) so arcs read as flight routes.
  let nx = -dy / distance;
  let ny = dx / distance;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const offset = Math.min(distance * lift, 160);
  const cx = Math.round((mx + nx * offset) * 10) / 10;
  const cy = Math.round((my + ny * offset) * 10) / 10;
  return `M${from.x} ${from.y}Q${cx} ${cy} ${to.x} ${to.y}`;
}

/** Regional-indicator flag emoji for an ISO alpha-2 code (decorative; always paired with the country name). */
export function flagEmoji(countryCode: string | null | undefined): string {
  const code = countryCode?.toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
