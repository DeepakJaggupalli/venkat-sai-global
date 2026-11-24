/** Shared classes for the /refer page (white cards, black and white pills, 48px+ touch targets). */

export const CARD = "relative rounded-3xl border border-border bg-white p-5 shadow-card sm:p-8";

export const INPUT = "h-12 text-base";

const PILL =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-70 [&_svg]:size-5 [&_svg]:shrink-0";

/** Main action: black pill. */
export const PILL_DARK = `${PILL} bg-foreground text-white hover:bg-[#26262b]`;

/** Secondary action (also WhatsApp, with the green glyph): white pill with a hairline border. */
export const PILL_LIGHT = `${PILL} border border-border bg-white text-foreground hover:border-[#c9cdd5] hover:bg-surface-subtle`;

/** Small text button (start again, see my referrals). */
export const TEXT_BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-semibold text-teal-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
