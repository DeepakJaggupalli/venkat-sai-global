import { describe, expect, it } from "vitest";

import {
  ARC,
  ARC_PATH,
  FLIGHT_START_MS,
  FLIGHT_TIMING,
  angleOf,
  cycleMs,
  easeInOutCubic,
  flightFrame,
  planeAt,
  planeTransform,
  quadPoint,
  quadTangent,
} from "./flight-path";

describe("flight curve", () => {
  it("runs from the origin to the destination through a gentle apex", () => {
    expect(quadPoint(ARC.start, ARC.control, ARC.end, 0)).toEqual(ARC.start);
    expect(quadPoint(ARC.start, ARC.control, ARC.end, 1)).toEqual(ARC.end);
    const apex = quadPoint(ARC.start, ARC.control, ARC.end, 0.5);
    expect(apex.x).toBe(300);
    expect(apex.y).toBe(22);
    // The apex is the highest point (smallest y) of the arc.
    for (let t = 0; t <= 1; t += 0.05) expect(quadPoint(ARC.start, ARC.control, ARC.end, t).y).toBeGreaterThanOrEqual(22 - 1e-9);
    expect(ARC_PATH).toBe("M0 88 Q300 -44 600 88");
  });

  it("points the plane along the curve: climbing, level at the apex, descending", () => {
    const start = planeAt(0);
    const mid = planeAt(0.5);
    const end = planeAt(1);
    expect(start.angle).toBeLessThan(-20);
    expect(start.angle).toBeGreaterThan(-30);
    expect(mid.angle).toBeCloseTo(0, 9);
    expect(end.angle).toBeCloseTo(-start.angle, 9);
    // Symmetric arc: the angle at t mirrors the angle at 1 - t.
    expect(planeAt(0.2).angle).toBeCloseTo(-planeAt(0.8).angle, 9);
  });

  it("measures angles the way SVG rotate() expects (0 = right, positive = clockwise on screen)", () => {
    expect(angleOf({ x: 1, y: 0 })).toBe(0);
    expect(angleOf({ x: 0, y: 1 })).toBe(90);
    expect(angleOf({ x: 0, y: -1 })).toBe(-90);
    expect(quadTangent({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, 0.3)).toEqual({ x: 2, y: 0 });
  });

  it("builds a plain SVG transform without negative zero", () => {
    expect(planeTransform(0.5)).toBe("translate(300 22) rotate(0)");
    expect(planeTransform(0)).toMatch(/^translate\(0 88\) rotate\(-23\.\d+\)$/);
    expect(planeTransform(1)).toMatch(/^translate\(600 88\) rotate\(23\.\d+\)$/);
    // Out-of-range progress stays on the route.
    expect(planeTransform(-1)).toBe(planeTransform(0));
    expect(planeTransform(2)).toBe(planeTransform(1));
    expect(planeTransform(Number.NaN)).toBe(planeTransform(0));
  });

  it("eases in and out symmetrically", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75), 12);
    for (let t = 0; t < 1; t += 0.1) expect(easeInOutCubic(t + 0.1)).toBeGreaterThanOrEqual(easeInOutCubic(t));
  });
});

describe("flight timing", () => {
  it("changes destination every 2.2 s: 1.1 s in the air, 1.1 s on the ground", () => {
    expect(FLIGHT_TIMING.flightMs).toBe(1100);
    expect(FLIGHT_TIMING.holdMs).toBe(1100);
    expect(cycleMs()).toBe(2200);
  });

  it("starts mid-flight, where the static picture shows the plane, on the first destination", () => {
    const first = flightFrame(FLIGHT_START_MS);
    expect(first.progress).toBe(0.5);
    expect(first.opacity).toBe(1);
    expect(first.step).toBe(0);
    expect(planeTransform(first.progress)).toBe("translate(300 22) rotate(0)");
  });

  it("swaps the destination only as the plane lands, then holds it", () => {
    const cycle = cycleMs();
    const landAt = FLIGHT_TIMING.flightMs * FLIGHT_TIMING.landAt;
    // First landing is on the destination already shown.
    expect(flightFrame(landAt + 1).step).toBe(0);
    // Second flight: the old city stays until touch-down.
    expect(flightFrame(cycle + 10).step).toBe(0);
    expect(flightFrame(cycle + landAt - 1).step).toBe(0);
    expect(flightFrame(cycle + landAt).step).toBe(1);
    expect(flightFrame(cycle + landAt).progress).toBeGreaterThan(0.95);
    expect(flightFrame(2 * cycle - 1).step).toBe(1);
    expect(flightFrame(2 * cycle + landAt).step).toBe(2);
  });

  it("parks the plane on arrival, fades it out before the next take-off and fades it in at the origin", () => {
    const cycle = cycleMs();
    const parked = flightFrame(cycle + FLIGHT_TIMING.flightMs + 100);
    expect(parked.progress).toBe(1);
    expect(parked.opacity).toBe(1);
    expect(flightFrame(2 * cycle - FLIGHT_TIMING.fadeOutMs / 2).opacity).toBeCloseTo(0.5, 6);
    const takeOff = flightFrame(2 * cycle);
    expect(takeOff.progress).toBe(0);
    expect(takeOff.opacity).toBe(0);
    expect(flightFrame(2 * cycle + FLIGHT_TIMING.fadeInMs).opacity).toBe(1);
  });

  it("treats invalid or negative time as the start", () => {
    expect(flightFrame(-500)).toEqual(flightFrame(0));
    expect(flightFrame(Number.NaN)).toEqual(flightFrame(0));
    expect(flightFrame(0).step).toBe(0);
  });
});
