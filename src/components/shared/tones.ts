/**
 * Semantic tones shared by badges, callouts, timeline markers and avatars (client-safe, pure data).
 *
 * Contrast notes (WCAG 2.2 AA, 4.5:1 for small text), measured against white and the matching
 * soft background from src/app/globals.css:
 *  - `text-success` (#15966a, 3.75:1) and `text-warning` (#b97d14, 3.50:1) FAIL AA as small text,
 *    and `text-destructive` / `text-teal-strong` drop just under 4.5:1 on their soft fills.
 *  - We therefore derive darker text colours from the same tokens with `color-mix()` so a token change
 *    still flows through: success 20% black (#0c6e4d → 5.55:1 on success-soft), warning 25% black
 *    (#7d530a → 6.02:1), danger 10% black (#aa3434 → 5.56:1), teal-strong 10% black (#086b67 → 5.63:1).
 *    `text-info` (5.32:1 on info-soft) and `text-gold-strong` (4.86:1 on gold-soft) pass as-is.
 * If dedicated `--*-strong` tokens are added to globals.css later, swap the arbitrary values here only.
 */
export const TONES = ["neutral", "info", "success", "warning", "danger", "brand", "gold"] as const;
export type Tone = (typeof TONES)[number];

export type ToneStyle = {
  /** Soft surface + AA text, for badges and chips. */
  soft: string;
  /** AA text colour on white or on the soft surface. */
  text: string;
  /** Decorative marker fill (dots, timeline nodes, icon tiles). Never the only signal. */
  dot: string;
  /** Border colour for outlined callouts. */
  border: string;
  /** Soft surface only (callout background, icon tile). */
  surface: string;
};

const SUCCESS_TEXT = "text-[color:color-mix(in_oklab,var(--success),black_20%)]";
const WARNING_TEXT = "text-[color:color-mix(in_oklab,var(--warning),black_25%)]";
const DANGER_TEXT = "text-[color:color-mix(in_oklab,var(--destructive),black_10%)]";
const BRAND_TEXT = "text-[color:color-mix(in_oklab,var(--brand-teal-strong),black_10%)]";

export const TONE_STYLES: Record<Tone, ToneStyle> = {
  neutral: {
    soft: "bg-secondary text-secondary-foreground",
    text: "text-secondary-foreground",
    dot: "bg-muted-foreground",
    border: "border-border",
    surface: "bg-surface-subtle",
  },
  info: {
    soft: "bg-info-soft text-info",
    text: "text-info",
    dot: "bg-info",
    border: "border-info/25",
    surface: "bg-info-soft",
  },
  success: {
    soft: `bg-success-soft ${SUCCESS_TEXT}`,
    text: SUCCESS_TEXT,
    dot: "bg-success",
    border: "border-success/25",
    surface: "bg-success-soft",
  },
  warning: {
    soft: `bg-warning-soft ${WARNING_TEXT}`,
    text: WARNING_TEXT,
    dot: "bg-warning",
    border: "border-warning/30",
    surface: "bg-warning-soft",
  },
  danger: {
    soft: `bg-danger-soft ${DANGER_TEXT}`,
    text: DANGER_TEXT,
    dot: "bg-danger",
    border: "border-danger/25",
    surface: "bg-danger-soft",
  },
  brand: {
    soft: `bg-teal-soft ${BRAND_TEXT}`,
    text: BRAND_TEXT,
    dot: "bg-teal",
    border: "border-teal/30",
    surface: "bg-teal-soft",
  },
  gold: {
    soft: "bg-gold-soft text-gold-strong",
    text: "text-gold-strong",
    dot: "bg-gold",
    border: "border-gold/40",
    surface: "bg-gold-soft",
  },
};

export function isTone(value: unknown): value is Tone {
  return typeof value === "string" && (TONES as readonly string[]).includes(value);
}
