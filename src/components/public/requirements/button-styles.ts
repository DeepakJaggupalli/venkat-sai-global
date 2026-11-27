const BUTTON =
  "inline-flex min-h-11 flex-1 basis-28 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-4 [&_svg]:shrink-0";

/** Apply / WhatsApp pills of a requirement (poster cards and the homepage hero poster slideshow). */
export const POSTER_BUTTON_STYLES = {
  apply: `${BUTTON} group/apply bg-foreground text-white hover:bg-[#26262b]`,
  whatsapp: `${BUTTON} border border-border bg-white text-foreground hover:border-[#c9cdd5] hover:bg-surface-subtle`,
} as const;
