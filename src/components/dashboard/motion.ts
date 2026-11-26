import "./dashboard-motion.css";

/**
 * CSS-only motion classes of the dashboard kit (see dashboard-motion.css). Every animation stops for
 * prefers-reduced-motion. Importing this module loads the stylesheet.
 */
export const DASH_MOTION = {
  /** Count-up digits: set `--vsg-count-to` to the value (see CountUp). */
  countUp: "vsg-count-up",
  /** Gentle fade-up of one block. */
  rise: "vsg-rise",
  /** Fade-up of each child, staggered. */
  stagger: "vsg-stagger",
} as const;
