/**
 * Geometry and timing of the hero route card's flight (pure and client-safe; no DOM).
 *
 * The route is drawn in an SVG whose viewBox is VIEW_W x VIEW_H, scaled uniformly (the box keeps the same aspect
 * ratio), so one set of numbers serves every card width. The arc is a quadratic curve from the origin (low, at the
 * start edge) up to a gentle apex and down to the destination (low, at the end edge). The plane is drawn pointing
 * right (+x) around (0, 0), so rotating it to the curve's tangent angle makes it face the way it flies.
 */

export type Point = { x: number; y: number };

export const VIEW_W = 600;
export const VIEW_H = 100;

/** Start, control and end point of the arc (viewBox units; y grows downwards). The apex sits at y = 22. */
export const ARC = {
  start: { x: 0, y: 88 },
  control: { x: VIEW_W / 2, y: -44 },
  end: { x: VIEW_W, y: 88 },
} as const satisfies Record<string, Point>;

export const ARC_PATH = `M${ARC.start.x} ${ARC.start.y} Q${ARC.control.x} ${ARC.control.y} ${ARC.end.x} ${ARC.end.y}`;

/** A small airliner seen from above, nose at +x, centred on (0, 0), about 37 x 32 units. */
export const PLANE_PATH =
  "M18 0C18 -1.6 16.6 -2.6 15 -2.6L4 -2.6L-5 -16L-9 -16L-4 -2.6L-12 -2.6L-16 -8L-18.5 -8L-16.5 -1.5L-16.5 1.5L-18.5 8L-16 8L-12 2.6L-4 2.6L-9 16L-5 16L4 2.6L15 2.6C16.6 2.6 18 1.6 18 0Z";

export function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Point on the quadratic Bézier p0 → p2 (control p1) at t (0..1). */
export function quadPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
}

/** Derivative (direction of travel) of the same curve at t. */
export function quadTangent(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return { x: 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x), y: 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y) };
}

/** Angle of a direction in degrees, as SVG `rotate()` expects it (0 = pointing right, positive = clockwise on screen). */
export function angleOf(direction: Point): number {
  return (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Where the plane is and which way it faces at `progress` (0 = origin, 1 = destination) along the arc. */
export function planeAt(progress: number): Point & { angle: number } {
  const t = clamp01(progress);
  const point = quadPoint(ARC.start, ARC.control, ARC.end, t);
  return { ...point, angle: angleOf(quadTangent(ARC.start, ARC.control, ARC.end, t)) };
}

/** Two decimals, and never "-0". */
const round = (n: number) => Math.round(n * 100) / 100 || 0;

/** SVG transform for the plane group at `progress` along the arc. */
export function planeTransform(progress: number): string {
  const { x, y, angle } = planeAt(progress);
  return `translate(${round(x)} ${round(y)}) rotate(${round(angle)})`;
}

export type FlightTiming = {
  /** Take-off to touch-down. */
  flightMs: number;
  /** Time on the ground at the destination before the next take-off. */
  holdMs: number;
  /** Fraction of the flight after which the next destination crossfades in (the plane is then ~97% of the way). */
  landAt: number;
  fadeInMs: number;
  fadeOutMs: number;
};

/** One destination change every 2.2 s: 1.1 s in the air, 1.1 s on the ground. */
export const FLIGHT_TIMING: FlightTiming = { flightMs: 1100, holdMs: 1100, landAt: 0.8, fadeInMs: 160, fadeOutMs: 240 };

export function cycleMs(timing: FlightTiming = FLIGHT_TIMING): number {
  return timing.flightMs + timing.holdMs;
}

/**
 * The loop starts halfway through a flight, where the static picture (server render, reduced motion) shows the plane:
 * the first take-off is already "in the air" and lands on the first destination, which is on show from the start.
 */
export const FLIGHT_START_MS = FLIGHT_TIMING.flightMs / 2;

export type FlightFrame = {
  /** 0..1 along the arc. */
  progress: number;
  opacity: number;
  /**
   * Landings so far: the destination on show is `step % destinations.length`. The first landing (step 0) is on the
   * destination that is already shown, so the city never changes before the plane arrives.
   */
  step: number;
};

/** Plane position, opacity and destination step `elapsed` ms into the loop (only while it runs; paused time is not counted). */
export function flightFrame(elapsed: number, timing: FlightTiming = FLIGHT_TIMING): FlightFrame {
  const cycle = cycleMs(timing);
  const t = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const k = Math.floor(t / cycle);
  const phase = t - k * cycle;
  const inFlight = phase < timing.flightMs;
  const progress = inFlight ? easeInOutCubic(phase / timing.flightMs) : 1;
  let opacity = 1;
  if (inFlight) opacity = Math.min(1, phase / timing.fadeInMs);
  else if (phase > cycle - timing.fadeOutMs) opacity = Math.max(0, (cycle - phase) / timing.fadeOutMs);
  const landed = phase >= timing.flightMs * timing.landAt;
  return { progress, opacity, step: Math.max(0, landed ? k : k - 1) };
}
