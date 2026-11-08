"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { GLOBE_DESTINATIONS, GLOBE_HQ, GLOBE_LABELS, landDots, type LonLat } from "./globe-data";

/**
 * Interactive hero globe (canvas, no libraries): a dot-matrix Earth in orthographic projection, flight arcs
 * from Visakhapatnam to each destination and small planes travelling along them. It sways gently, can be
 * dragged to turn, pauses when off-screen or in a background tab, and draws a single still frame for
 * visitors who prefer reduced motion. Purely decorative (`aria-hidden`); the hero text and the destinations
 * marquee carry the meaning.
 */

const DEG = Math.PI / 180;
const YELLOW = "#ffd000";
const RED = "#e3262e";

type Vec = { x: number; y: number; z: number };

function toVec([lon, lat]: LonLat): Vec {
  const l = lon * DEG;
  const p = lat * DEG;
  return { x: Math.cos(p) * Math.sin(l), y: Math.sin(p), z: Math.cos(p) * Math.cos(l) };
}

/** Great-circle points between a and b, lifted off the surface in the middle (unit sphere = 1). */
function arcPoints(a: Vec, b: Vec, samples = 56): Vec[] {
  const dot = Math.min(Math.max(a.x * b.x + a.y * b.y + a.z * b.z, -1), 1);
  const omega = Math.acos(dot);
  const lift = 0.06 + 0.32 * (omega / Math.PI);
  const pts: Vec[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const s = Math.sin(omega) || 1;
    const k1 = Math.sin((1 - t) * omega) / s;
    const k2 = Math.sin(t * omega) / s;
    const h = 1 + lift * Math.sin(Math.PI * t);
    pts.push({ x: (a.x * k1 + b.x * k2) * h, y: (a.y * k1 + b.y * k2) * h, z: (a.z * k1 + b.z * k2) * h });
  }
  return pts;
}

/** Rotate a world vector into view space: yaw by the centre longitude, then pitch by the centre latitude. */
function view(v: Vec, lon0: number, lat0: number): Vec {
  const cl = Math.cos(-lon0);
  const sl = Math.sin(-lon0);
  const x1 = v.x * cl + v.z * sl;
  const z1 = -v.x * sl + v.z * cl;
  const cp = Math.cos(lat0);
  const sp = Math.sin(lat0);
  return { x: x1, y: v.y * cp - z1 * sp, z: v.y * sp + z1 * cp };
}

function visible(p: Vec): boolean {
  return p.z > 0 || p.x * p.x + p.y * p.y > 1;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HeroGlobe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dots = landDots().map(toVec);
    const hq = toVec(GLOBE_HQ.lonLat);
    const routes = GLOBE_DESTINATIONS.map((d, i) => ({ ...d, vec: toVec(d.lonLat), pts: arcPoints(hq, toVec(d.lonLat)), offset: (i * 0.37) % 1, speed: 0.07 + (i % 4) * 0.012 }));
    const reduced = prefersReducedMotion();

    let width = 0;
    let dpr = 1;
    let raf = 0;
    let running = false;
    let onScreen = true;
    // Start a few seconds in so the planes are already spread along their routes on the first frame.
    const start = performance.now() - 4000;
    // Drag state: user offset in radians, eased back to zero after release.
    let dragOffset = 0;
    let dragging = false;
    let lastX = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.width * dpr);
    };

    const draw = (now: number) => {
      const elapsed = (now - start) / 1000;
      const size = width;
      if (!size) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const R = size * 0.4;
      const sway = reduced ? 0 : Math.sin(elapsed * 0.12) * 22 * DEG;
      const lon0 = 72 * DEG + sway + dragOffset;
      const lat0 = 24 * DEG;
      const px = (p: Vec) => cx + p.x * R;
      const py = (p: Vec) => cy - p.y * R;

      // Atmosphere glow and sphere body.
      const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35);
      glow.addColorStop(0, "rgba(61,99,224,0.35)");
      glow.addColorStop(1, "rgba(61,99,224,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
      ctx.fill();
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      body.addColorStop(0, "#2a50c8");
      body.addColorStop(0.55, "#12307f");
      body.addColorStop(1, "#071645");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(143,176,255,0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Graticule: meridians every 30 degrees, parallels every 30 degrees.
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      for (let m = -180; m < 180; m += 30) {
        ctx.beginPath();
        let pen = false;
        for (let lat = -80; lat <= 80; lat += 5) {
          const p = view(toVec([m, lat]), lon0, lat0);
          if (p.z <= 0) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(px(p), py(p));
          else ctx.moveTo(px(p), py(p));
          pen = true;
        }
        ctx.stroke();
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let pen = false;
        for (let lon = -180; lon <= 180; lon += 5) {
          const p = view(toVec([lon, lat]), lon0, lat0);
          if (p.z <= 0) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(px(p), py(p));
          else ctx.moveTo(px(p), py(p));
          pen = true;
        }
        ctx.stroke();
      }

      // Land dots, brighter towards the viewer.
      const dot = Math.max(1.2, size / 300);
      for (const d of dots) {
        const p = view(d, lon0, lat0);
        if (p.z <= 0.02) continue;
        ctx.fillStyle = `rgba(214,226,255,${(0.18 + p.z * 0.6).toFixed(3)})`;
        ctx.fillRect(px(p) - dot / 2, py(p) - dot / 2, dot, dot);
      }

      // Routes: faint full arc, a bright comet tail and a plane at the head.
      for (const r of routes) {
        const pts = r.pts.map((p) => view(p, lon0, lat0));
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(255,208,0,0.35)";
        ctx.beginPath();
        let pen = false;
        for (const p of pts) {
          if (!visible(p)) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(px(p), py(p));
          else ctx.moveTo(px(p), py(p));
          pen = true;
        }
        ctx.stroke();

        const t = reduced ? 0.62 : (elapsed * r.speed + r.offset) % 1;
        const head = Math.min(Math.floor(t * (pts.length - 1)), pts.length - 2);
        const tail = Math.max(0, head - 10);
        ctx.lineWidth = 2.2;
        for (let i = tail; i < head; i++) {
          const a = pts[i]!;
          const b = pts[i + 1]!;
          if (!visible(a) || !visible(b)) continue;
          ctx.strokeStyle = `rgba(255,208,0,${(((i - tail) / 10) * 0.9).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(px(a), py(a));
          ctx.lineTo(px(b), py(b));
          ctx.stroke();
        }
        const a = pts[head]!;
        const b = pts[head + 1]!;
        if (visible(a)) {
          const angle = Math.atan2(py(b) - py(a), px(b) - px(a));
          const s = Math.max(4, size / 90);
          ctx.save();
          ctx.translate(px(a), py(a));
          ctx.rotate(angle);
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = YELLOW;
          ctx.shadowBlur = 10;
          // Simple plane: fuselage + wings + tail.
          ctx.beginPath();
          ctx.moveTo(s * 1.2, 0);
          ctx.lineTo(-s * 0.2, s * 0.25);
          ctx.lineTo(-s * 0.35, s * 1.0);
          ctx.lineTo(-s * 0.7, s * 1.0);
          ctx.lineTo(-s * 0.55, s * 0.25);
          ctx.lineTo(-s, s * 0.22);
          ctx.lineTo(-s * 1.2, s * 0.6);
          ctx.lineTo(-s * 1.35, s * 0.6);
          ctx.lineTo(-s * 1.25, 0);
          ctx.lineTo(-s * 1.35, -s * 0.6);
          ctx.lineTo(-s * 1.2, -s * 0.6);
          ctx.lineTo(-s, -s * 0.22);
          ctx.lineTo(-s * 0.55, -s * 0.25);
          ctx.lineTo(-s * 0.7, -s * 1.0);
          ctx.lineTo(-s * 0.35, -s * 1.0);
          ctx.lineTo(-s * 0.2, -s * 0.25);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Destination marker and label.
        const end = view(r.vec, lon0, lat0);
        if (end.z > 0) {
          ctx.fillStyle = YELLOW;
          ctx.beginPath();
          ctx.arc(px(end), py(end), Math.max(2.2, size / 200), 0, Math.PI * 2);
          ctx.fill();
          if (GLOBE_LABELS.has(r.code) && end.z > 0.25 && size > 320) {
            ctx.font = `600 ${Math.max(10, Math.round(size / 48))}px ui-sans-serif, system-ui, sans-serif`;
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.shadowColor = "rgba(6,18,58,0.9)";
            ctx.shadowBlur = 4;
            ctx.fillText(r.label, px(end) + 6, py(end) - 6);
            ctx.shadowBlur = 0;
          }
        }
      }

      // Headquarters: pulsing red ring with a yellow core.
      const h = view(hq, lon0, lat0);
      if (h.z > 0) {
        const pulse = reduced ? 0.5 : (elapsed * 0.8) % 1;
        ctx.strokeStyle = `rgba(227,38,46,${(1 - pulse).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px(h), py(h), 5 + pulse * 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = RED;
        ctx.beginPath();
        ctx.arc(px(h), py(h), 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = YELLOW;
        ctx.beginPath();
        ctx.arc(px(h), py(h), 2.6, 0, Math.PI * 2);
        ctx.fill();
        if (size > 320) {
          ctx.font = `700 ${Math.max(11, Math.round(size / 42))}px ui-sans-serif, system-ui, sans-serif`;
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "rgba(6,18,58,0.9)";
          ctx.shadowBlur = 4;
          ctx.fillText(GLOBE_HQ.label, px(h) + 10, py(h) + 18);
          ctx.shadowBlur = 0;
        }
      }
    };

    const loop = (now: number) => {
      if (!dragging && Math.abs(dragOffset) > 0.0005) dragOffset *= 0.985;
      draw(now);
      raf = running ? requestAnimationFrame(loop) : 0;
    };
    const play = () => {
      if (reduced || running || !onScreen || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const pause = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    resize();
    draw(performance.now());
    play();

    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = Boolean(entry?.isIntersecting);
      if (onScreen) play();
      else pause();
    });
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVisibility);

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      dragOffset -= ((e.clientX - lastX) / Math.max(width, 1)) * Math.PI * 0.9;
      dragOffset = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, dragOffset));
      lastX = e.clientX;
      if (!running) draw(performance.now());
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      pause();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div aria-hidden="true" className={cn("relative aspect-square w-full", className)}>
      {/* Server-rendered placeholder disc, covered by the canvas once it draws. */}
      <div className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#2a50c8,#12307f_55%,#071645)] shadow-[0_0_80px_10px_rgb(61_99_224/0.35)]" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full cursor-grab touch-pan-y active:cursor-grabbing" />
    </div>
  );
}
