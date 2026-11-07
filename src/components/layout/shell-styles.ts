/**
 * Shared class strings for the portal shell (client-safe).
 * Portal pages render inside SHELL_CONTENT_CLASS — they should not add `.container-page` themselves.
 */

/** Horizontal rhythm of the portal content column (matches the top bar and status banner). */
export const SHELL_CONTENT_CLASS = "mx-auto w-full max-w-[96rem] px-4 sm:px-6 lg:px-8";

/**
 * For small uppercase/tracked labels that may show Hindi or Telugu (People Portal): letter-spacing
 * breaks Indic glyph clusters and 11px Indic text is hard to read, so non-English content gets normal
 * tracking and 12px. Relies on the `lang` attribute PortalShell sets.
 */
export const MICRO_LABEL_I18N = "[&:not(:lang(en))]:tracking-normal [&:not(:lang(en))]:text-xs";

/** Sidebar widths (CSS lengths) — kept here so the sidebar and content offset never disagree. */
export const SIDEBAR_WIDTH = { expanded: "17rem", collapsed: "4.75rem" } as const;

/** Icon-button sizing used across the top bar (44px touch target on mobile, 40px on desktop). */
export const TOPBAR_ICON_BUTTON =
  "size-11 rounded-full text-muted-foreground hover:text-navy sm:size-10 [&_svg:not([class*='size-'])]:size-5";
