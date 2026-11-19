import { IMAGE_CREDITS, type ImageCredit } from "./image-credits";

/**
 * Which stock photograph illustrates which service, training family or theme (pure, client-safe).
 * CMS media uploaded by the business always wins; these are the fallback so no page shows a drawn
 * illustration. Every file is credited on /legal/image-credits.
 */

export type StockTopic = ImageCredit["topic"];

const BY_SRC = new Map(IMAGE_CREDITS.map((c) => [c.src, c]));

function photo(name: string): ImageCredit | undefined {
  return BY_SRC.get(`/images/stock/${name}.webp`);
}

/** Named photographs for the designed sections (homepage, about, contact). */
export const STOCK = {
  overseas: "gulf-1",
  training: "pipe-2",
  manpower: "rigging-1",
  departure: "travel-1",
  flight: "travel-2",
  workshop: "fabrication-1",
  employers: "crew-2",
  plant: "plant-1",
  shipyard: "shipyard-1",
  classroom: "training-1",
  doha: "gulf-2",
} as const;

export type StockKey = keyof typeof STOCK;

/** Specific photographs for the seeded service and training-family slugs (distinct where they appear together). */
const BY_SLUG: Readonly<Record<string, string>> = {
  "overseas-employment": "gulf-1",
  "technical-training": "pipe-2",
  "bulk-manpower-supply": "rigging-1",
  "recruitment-and-placements": "crew-2",
  "domestic-hiring": "shipyard-1",
  internships: "training-2",
  apprenticeships: "welding-2",
  "professional-training": "training-1",
  "welding-and-industrial-testing": "welding-1",
  "skill-assessment": "fabrication-1",
  "career-development": "travel-1",
  "campus-recruitment": "training-2",
  "recruitment-management": "crew-3",
  "hr-technology": "electrical-2",
  "corporate-workforce-solutions": "plant-2",
  "employer-recruitment-support": "scaffolding-2",
  "training-partnerships": "training-1",
  "international-mobility-coordination": "travel-2",
  "welding-training": "welding-3",
  "pipe-fitting-training": "pipe-1",
  "structural-fitting-fabrication-training": "fabrication-2",
  "electrical-training": "electrical-1",
  "piping-training": "plant-1",
  "rigging-training": "rigging-2",
  "scaffolding-training": "scaffolding-1",
  "mechanical-fitter-training": "mechanical-1",
  "ndt-awareness-training": "inspection-1",
  "hse-safety-training": "safety-1",
};

/** Topic for a CMS icon name (services and training families pick an icon in the CMS). */
const TOPIC_BY_ICON: Readonly<Record<string, StockTopic>> = {
  plane: "travel",
  globe: "gulf",
  map: "gulf",
  ship: "shipyard",
  flame: "welding",
  users: "crew",
  "user-check": "crew",
  handshake: "crew",
  briefcase: "crew",
  layers: "crew",
  laptop: "electrical",
  wrench: "pipe",
  route: "plant",
  fuel: "plant",
  hammer: "fabrication",
  factory: "plant",
  "building-2": "shipyard",
  zap: "electrical",
  lightbulb: "electrical",
  cpu: "electrical",
  anchor: "rigging",
  truck: "rigging",
  "hard-hat": "scaffolding",
  cog: "mechanical",
  settings: "mechanical",
  search: "inspection",
  "clipboard-check": "inspection",
  "shield-check": "safety",
  "graduation-cap": "training",
  "book-open": "training",
  award: "training",
  school: "training",
  compass: "travel",
};

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function stockPhoto(key: StockKey): ImageCredit {
  return photo(STOCK[key]) ?? IMAGE_CREDITS[0]!;
}

export function photosForTopic(topic: StockTopic): ImageCredit[] {
  return IMAGE_CREDITS.filter((c) => c.topic === topic);
}

/**
 * The stock photograph for a service or training family: its own slug first, then a photo of its icon's topic
 * (stable per slug), then a stable pick from the whole set. Never returns undefined while photos exist.
 */
export function stockPhotoFor({ slug, iconName }: { slug?: string | null; iconName?: string | null }): ImageCredit {
  const named = slug ? BY_SLUG[slug] : undefined;
  const bySlug = named ? photo(named) : undefined;
  if (bySlug) return bySlug;
  const topic = iconName ? TOPIC_BY_ICON[iconName] : undefined;
  const pool = topic ? photosForTopic(topic) : [];
  const list = pool.length ? pool : IMAGE_CREDITS;
  return list[hash(slug ?? iconName ?? "") % list.length]!;
}

/** Photographs for Venkat Sai's own seeded courses (scripts/seed-training-programs.ts), distinct where they appear together. */
const COURSE_BY_SLUG: Readonly<Record<string, string>> = {
  "arc-welding-smaw-3g-4g-plate": "welding-2",
  "tig-welding-gtaw-6g-pipe-carbon-and-stainless-steel": "welding-3",
  "mig-mag-gmaw-and-fcaw-welding": "welding-1",
  "pipe-welding-6g-combination-tig-root-arc-fill-and-cap": "pipe-2",
  "industrial-electrician-wiring-panels-and-motor-control": "electrical-1",
  "pipe-fitter-isometric-drawings-fit-up-and-alignment": "pipe-1",
  "structural-fitter-and-fabricator": "fabrication-2",
  "rigging-and-scaffolding-basics": "rigging-1",
  "mechanical-helper-fitter-basics": "mechanical-1",
};

/** Trade keywords in a course's title or category, checked in order (structural before pipe, so "structural fitter" is fabrication). */
const COURSE_KEYWORDS: readonly (readonly [RegExp, StockTopic])[] = [
  [/\bweld|\b(tig|mig|mag|arc|smaw|gtaw|gmaw|fcaw)\b/, "welding"],
  [/electric|wiring/, "electrical"],
  [/structural|fabricat/, "fabrication"],
  [/rigg|scaffold/, "rigging"],
  [/mechanical|helper/, "mechanical"],
  [/pipe|piping|fitter/, "pipe"],
  [/\bndt\b|inspection|testing/, "inspection"],
  [/safety|\bhse\b/, "safety"],
];

/**
 * The stock photograph for a course without a cover of its own: its slug first (Venkat Sai's own courses), then
 * a photo of the trade named in its title or category (stable per slug), then a training or workshop photo.
 * A cover uploaded for the course always wins; callers only use this when there is none.
 */
export function stockPhotoForCourse({ slug, title, category }: { slug?: string | null; title?: string | null; category?: string | null }): ImageCredit {
  const named = slug ? (COURSE_BY_SLUG[slug] ?? BY_SLUG[slug]) : undefined;
  const bySlug = named ? photo(named) : undefined;
  if (bySlug) return bySlug;
  const text = `${title ?? ""} ${category ?? ""}`.toLowerCase();
  const topic = COURSE_KEYWORDS.find(([pattern]) => pattern.test(text))?.[1] ?? "training";
  const pool = photosForTopic(topic);
  const list = pool.length ? pool : photosForTopic("training");
  return list[hash(slug ?? title ?? "") % list.length] ?? stockPhoto("classroom");
}
