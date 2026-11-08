import { cn } from "@/lib/utils";

import {
  arcPath,
  coordsFor,
  HQ_COORDS,
  MAP_FRAME,
  MAP_HEIGHT,
  project,
} from "./geo";

/**
 * Designed brand visuals for the public site (server-safe SVG, no images, no inline styles — CSP friendly).
 * Every composition is decorative (`aria-hidden`); the surrounding text carries the meaning.
 * Motifs: the horizon arc and rising path of the logo, route arcs, weld sparks and a bead pattern.
 * Animations are slow and wrapped in `motion-safe:` so reduced-motion visitors see a still image.
 */

const TEAL = "#3d63e0";
const TEAL_LIGHT = "#8fb0ff";
const GOLD = "#ffd000";
const WHITE = "#ffffff";

/** Deterministic pseudo-random sequence (stable between server renders). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** A small four-point weld spark. */
function Spark({
  x,
  y,
  r = 6,
  color = GOLD,
  className,
}: {
  x: number;
  y: number;
  r?: number;
  color?: string;
  className?: string;
}) {
  const d = `M${x} ${y - r}L${x + r * 0.22} ${y - r * 0.22}L${x + r} ${y}L${x + r * 0.22} ${y + r * 0.22}L${x} ${y + r}L${x - r * 0.22} ${y + r * 0.22}L${x - r} ${y}L${x - r * 0.22} ${y - r * 0.22}Z`;
  return <path d={d} fill={color} className={className} />;
}

/**
 * Hero composition: a globe drawn as a graticule, route arcs leaving a gold origin point (Visakhapatnam)
 * and the logo's rising path, on a navy field. Sized by its container (`className`).
 */
export function HeroGlobe({ className }: { className?: string }) {
  const cx = 300;
  const cy = 300;
  const r = 210;
  const meridians = [0.18, 0.42, 0.66, 0.88];
  const parallels = [-0.62, -0.32, 0, 0.32, 0.62];
  // Origin and destinations on the visible face of the globe (decorative positions, not data).
  const origin = { x: 352, y: 318 };
  const destinations = [
    { x: 196, y: 248 },
    { x: 238, y: 172 },
    { x: 150, y: 330 },
    { x: 330, y: 150 },
    { x: 438, y: 214 },
    { x: 452, y: 392 },
  ];
  return (
    <svg
      viewBox="0 0 600 600"
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      <defs>
        <radialGradient id="hg-glow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={TEAL} stopOpacity="0.32" />
          <stop offset="60%" stopColor={TEAL} stopOpacity="0.06" />
          <stop offset="100%" stopColor={TEAL} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hg-sphere" x1="20%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stopColor={WHITE} stopOpacity="0.10" />
          <stop offset="100%" stopColor={WHITE} stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id="hg-route" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={GOLD} />
          <stop offset="100%" stopColor={TEAL_LIGHT} />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={290} fill="url(#hg-glow)" />
      {/* Orbit rings */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={276}
        ry={92}
        fill="none"
        stroke={WHITE}
        strokeOpacity="0.08"
        transform={`rotate(-18 ${cx} ${cy})`}
      />
      <ellipse
        cx={cx}
        cy={cy}
        rx={262}
        ry={150}
        fill="none"
        stroke={TEAL_LIGHT}
        strokeOpacity="0.14"
        strokeDasharray="2 8"
        transform={`rotate(24 ${cx} ${cy})`}
      />
      {/* Sphere + graticule */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="url(#hg-sphere)"
        stroke={WHITE}
        strokeOpacity="0.22"
      />
      <g fill="none" stroke={WHITE} strokeOpacity="0.12">
        {meridians.map((m) => (
          <ellipse key={`m${m}`} cx={cx} cy={cy} rx={r * m} ry={r} />
        ))}
        {parallels.map((p) => {
          const y = cy + p * r;
          const half = Math.sqrt(1 - p * p) * r;
          return (
            <ellipse key={`p${p}`} cx={cx} cy={y} rx={half} ry={half * 0.16} />
          );
        })}
      </g>
      {/* Routes */}
      <g fill="none" strokeLinecap="round">
        {destinations.map((d, i) => (
          <path
            key={`r${i}`}
            d={arcPath(origin, d, 0.42)}
            stroke="url(#hg-route)"
            strokeWidth={i % 2 === 0 ? 2.2 : 1.6}
            strokeOpacity={0.85}
            strokeDasharray={i % 2 === 0 ? undefined : "4 6"}
          />
        ))}
      </g>
      {destinations.map((d, i) => (
        <g key={`d${i}`}>
          <circle
            cx={d.x}
            cy={d.y}
            r={9}
            fill={TEAL}
            fillOpacity="0.18"
            className="motion-safe:animate-pulse"
          />
          <circle cx={d.x} cy={d.y} r={3.6} fill={TEAL_LIGHT} />
        </g>
      ))}
      {/* Origin: the weld spark */}
      <circle
        cx={origin.x}
        cy={origin.y}
        r={16}
        fill={GOLD}
        fillOpacity="0.16"
      />
      <circle cx={origin.x} cy={origin.y} r={5} fill={GOLD} />
      <Spark x={origin.x + 18} y={origin.y - 20} r={7} />
      {/* The logo's rising path, large and quiet, crossing the horizon */}
      <path
        d="M118 470 L 214 548 L 330 420"
        fill="none"
        stroke={WHITE}
        strokeOpacity="0.10"
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Spark x={86} y={150} r={5} color={TEAL_LIGHT} />
      <Spark x={528} y={486} r={6} />
      <Spark x={516} y={118} r={4} color={WHITE} />
    </svg>
  );
}

export type MapPoint = {
  code: string;
  label: string;
  region?: string | null;
  href?: string | null;
};

/**
 * Map-like Global Reach visual: an equirectangular graticule with a dotted field, Visakhapatnam as the origin
 * and an arc to each destination that is actually published. With no destinations it shows only the origin.
 */
export function ReachMap({
  points,
  className,
  tone = "dark",
  showLabels = true,
}: {
  points: readonly MapPoint[];
  className?: string;
  tone?: "dark" | "light";
  showLabels?: boolean;
}) {
  const hq = project(HQ_COORDS);
  const dark = tone === "dark";
  const line = dark ? WHITE : "#0b1f5c";
  const placed = points
    .map((p) => {
      const c = coordsFor(p.code, p.region);
      return c ? { ...p, ...project(c) } : null;
    })
    .filter((p): p is MapPoint & { x: number; y: number } => p !== null)
    .slice(0, 40);
  // Label only points that do not crowd an already-labelled neighbour (GCC capitals sit very close together);
  // every destination is also listed as text next to the map.
  const labelled = new Set<string>();
  const kept: { x: number; y: number }[] = [{ x: hq.x, y: hq.y }];
  for (const p of placed) {
    if (kept.every((k) => Math.hypot(k.x - p.x, k.y - p.y) > 46)) {
      labelled.add(p.code);
      kept.push(p);
    }
  }
  const rand = seeded(7);
  const dots: { x: number; y: number; o: number }[] = [];
  for (let y = 18; y < MAP_HEIGHT; y += 22) {
    for (let x = 12; x < MAP_FRAME.width; x += 22) {
      const v = rand();
      if (v > 0.55) dots.push({ x, y, o: 0.04 + (v - 0.55) * 0.18 });
    }
  }
  const lonLines = [-120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const latLines = [60, 30, 0, -30];
  return (
    <svg
      viewBox={`0 0 ${MAP_FRAME.width} ${MAP_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      <g fill={line}>
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={1.6} fillOpacity={d.o} />
        ))}
      </g>
      <g stroke={line} strokeOpacity={dark ? 0.1 : 0.08} fill="none">
        {lonLines.map((lon) => {
          const { x } = project({ lon, lat: 0 });
          return (
            <line key={`lon${lon}`} x1={x} x2={x} y1={0} y2={MAP_HEIGHT} />
          );
        })}
        {latLines.map((lat) => {
          const { y } = project({ lon: 0, lat });
          return (
            <line
              key={`lat${lat}`}
              x1={0}
              x2={MAP_FRAME.width}
              y1={y}
              y2={y}
              strokeDasharray={lat === 0 ? undefined : "3 7"}
            />
          );
        })}
      </g>
      <g fill="none" strokeLinecap="round">
        {placed.map((p) => (
          <path
            key={`a${p.code}`}
            d={arcPath(hq, p)}
            stroke={dark ? TEAL_LIGHT : TEAL}
            strokeOpacity={dark ? 0.7 : 0.8}
            strokeWidth={1.8}
          />
        ))}
      </g>
      {placed.map((p) => (
        <g key={`p${p.code}`}>
          <circle cx={p.x} cy={p.y} r={8} fill={TEAL} fillOpacity="0.2" />
          <circle
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill={dark ? TEAL_LIGHT : TEAL}
            stroke={dark ? "#06123a" : WHITE}
            strokeWidth={1.2}
          />
          {showLabels && labelled.has(p.code) ? (
            <text
              x={p.x + 8}
              y={p.y - 8}
              fontSize={13}
              fontWeight={600}
              fill={dark ? WHITE : "#0b1f5c"}
              fillOpacity={dark ? 0.85 : 0.9}
              className="font-heading"
            >
              {p.label}
            </text>
          ) : null}
        </g>
      ))}
      <circle
        cx={hq.x}
        cy={hq.y}
        r={18}
        fill={GOLD}
        fillOpacity="0.18"
        className="motion-safe:animate-pulse"
      />
      <circle
        cx={hq.x}
        cy={hq.y}
        r={5.5}
        fill={GOLD}
        stroke={dark ? "#06123a" : WHITE}
        strokeWidth={1.5}
      />
      {showLabels ? (
        <text
          x={hq.x + 10}
          y={hq.y + 20}
          fontSize={13}
          fontWeight={700}
          fill={dark ? GOLD : "#7a5a00"}
          className="font-heading"
        >
          Visakhapatnam
        </text>
      ) : null}
    </svg>
  );
}

/** Subtle weld-bead / hexagon pattern for section backgrounds (absolute, fills its positioned parent). */
export function BeadPattern({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  const rows = 6;
  const cols = 14;
  const color = tone === "dark" ? WHITE : "#0b1f5c";
  const cells: string[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * 52 + (row % 2) * 26;
      const y = row * 45;
      cells.push(`M${x + 26} ${y}l22 12.5v25l-22 12.5l-22-12.5v-25z`);
    }
  }
  return (
    <svg
      viewBox="0 0 728 270"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={cn(
        "pointer-events-none absolute inset-0 size-full",
        className,
      )}
    >
      <path
        d={cells.join("")}
        fill="none"
        stroke={color}
        strokeOpacity={tone === "dark" ? 0.06 : 0.05}
      />
    </svg>
  );
}

/** Horizon arc + sparks used as a corner ornament on page heroes and CTA bands. */
export function HorizonOrnament({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none", className)}
    >
      <circle
        cx={200}
        cy={240}
        r={150}
        fill="none"
        stroke={TEAL_LIGHT}
        strokeOpacity="0.28"
        strokeWidth={2}
        strokeDasharray="1 9"
        strokeLinecap="round"
      />
      <circle
        cx={200}
        cy={240}
        r={110}
        fill="none"
        stroke={WHITE}
        strokeOpacity="0.1"
      />
      <path
        d="M86 150 L 200 330 L 312 112"
        fill="none"
        stroke={WHITE}
        strokeOpacity="0.14"
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={318} cy={102} r={10} fill={GOLD} />
      <Spark x={346} y={74} r={8} />
      <Spark x={60} y={286} r={5} color={TEAL_LIGHT} />
    </svg>
  );
}

/** Small icon-sized composition for portal/audience cards: a path rising to a spark inside a soft ring. */
export function AudienceGlyph({
  variant,
  className,
}: {
  variant: "candidates" | "employers" | "partners" | "institutions";
  className?: string;
}) {
  const accent = {
    candidates: TEAL,
    employers: GOLD,
    partners: TEAL,
    institutions: GOLD,
  }[variant];
  const paths = {
    candidates: "M16 44 L28 30 L36 38 L50 20",
    employers:
      "M14 46 V28 L26 22 V46 M26 46 V18 L40 12 V46 M40 46 V26 L52 30 V46",
    partners: "M14 34 Q24 18 34 34 T54 34",
    institutions: "M12 26 L32 14 L52 26 L32 38 Z M20 31 V42 Q32 50 44 42 V31",
  }[variant];
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx={32} cy={32} r={30} fill={accent} fillOpacity="0.12" />
      <path
        d={paths}
        fill="none"
        stroke="#0b1f5c"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={variant === "candidates" ? 50 : 52}
        cy={variant === "candidates" ? 20 : 14}
        r={4}
        fill={accent}
      />
    </svg>
  );
}
