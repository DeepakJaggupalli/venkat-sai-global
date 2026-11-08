import { useId, type ReactNode } from "react";

import { CmsIcon } from "@/components/public/cms-icon";
import { cn } from "@/lib/utils";

/**
 * Designed, decorative SVG illustrations for services and training families, chosen by the entry's CMS icon.
 * Shown wherever the business has not uploaded a photo or video yet; CMS media always takes precedence.
 * Drawn with theme tokens (fill-/stroke- utilities), no external images.
 */

type Motif = "travel" | "weld" | "team" | "pipe" | "structure" | "electric" | "lift" | "scaffold" | "gear" | "inspect" | "safety" | "learn";

const MOTIF_BY_ICON: Record<string, Motif> = {
  plane: "travel",
  globe: "travel",
  ship: "travel",
  map: "travel",
  flame: "weld",
  users: "team",
  "user-check": "team",
  handshake: "team",
  briefcase: "team",
  wrench: "pipe",
  route: "pipe",
  fuel: "pipe",
  hammer: "structure",
  factory: "structure",
  "building-2": "structure",
  zap: "electric",
  lightbulb: "electric",
  cpu: "electric",
  anchor: "lift",
  truck: "lift",
  "hard-hat": "scaffold",
  cog: "gear",
  settings: "gear",
  search: "inspect",
  "clipboard-check": "inspect",
  "shield-check": "safety",
  "graduation-cap": "learn",
  "book-open": "learn",
  award: "learn",
  school: "learn",
};

const MOTIFS: Record<Motif, ReactNode> = {
  travel: (
    <g>
      <circle cx="160" cy="160" r="70" className="fill-white stroke-navy" strokeWidth="6" />
      <ellipse cx="160" cy="160" rx="30" ry="70" className="fill-none stroke-navy" strokeWidth="4" />
      <path d="M90 160h140M100 125h120M100 195h120" className="fill-none stroke-navy" strokeWidth="4" />
      <path d="M200 110 Q 260 40 330 80" className="fill-none stroke-gold" strokeWidth="5" strokeDasharray="10 10" strokeLinecap="round" />
      <path d="M318 62 l30 14 -30 14 6 -14z M318 76 h-16" className="fill-gold stroke-gold" strokeWidth="4" strokeLinejoin="round" />
    </g>
  ),
  weld: (
    <g>
      <rect x="60" y="190" width="130" height="28" rx="3" className="fill-navy" />
      <rect x="196" y="190" width="130" height="28" rx="3" className="fill-navy" />
      <path d="M186 190 q7 -10 14 0 q7 -10 14 0" className="fill-gold" />
      <path d="M250 70 l-50 105" className="stroke-navy" strokeWidth="18" strokeLinecap="round" />
      <path d="M262 46 l-14 30" className="stroke-teal" strokeWidth="24" strokeLinecap="round" />
      <circle cx="198" cy="182" r="10" className="fill-gold" />
      <path d="M198 182 l-40 -30 M198 182 l-48 -6 M198 182 l-30 -45 M198 182 l40 -36 M198 182 l52 -8" className="stroke-gold" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 8" />
    </g>
  ),
  team: (
    <g>
      {[110, 200, 290].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy={i === 1 ? 120 : 135} r="28" className="fill-white stroke-navy" strokeWidth="5" />
          <path d={`M${x - 34} ${i === 1 ? 112 : 127} a34 30 0 0 1 68 0z`} className="fill-gold" />
          <path d={`M${x - 50} ${i === 1 ? 230 : 240} q0 -70 50 -70 q50 0 50 70z`} className="fill-navy" />
        </g>
      ))}
    </g>
  ),
  pipe: (
    <g>
      <path d="M60 210 H170 Q230 210 230 150 V70" className="fill-none stroke-navy" strokeWidth="34" />
      <rect x="150" y="186" width="14" height="48" rx="2" className="fill-teal" />
      <rect x="206" y="100" width="48" height="14" rx="2" className="fill-teal" />
      <path d="M100 193 v34" className="stroke-gold" strokeWidth="5" strokeLinecap="round" />
      <path d="M216 150 h28" className="stroke-gold" strokeWidth="5" strokeLinecap="round" />
      <rect x="300" y="160" width="40" height="70" rx="4" className="fill-white stroke-navy" strokeWidth="5" />
      <path d="M300 190 h40 M320 160 v-20 h-14 h28" className="fill-none stroke-navy" strokeWidth="5" />
    </g>
  ),
  structure: (
    <g>
      <path d="M90 240 V90 M310 240 V90 M80 90 H320 M80 165 H320" className="fill-none stroke-navy" strokeWidth="14" />
      <path d="M90 165 L200 90 L310 165 M90 240 L200 165 L310 240" className="fill-none stroke-teal" strokeWidth="6" />
      {[90, 200, 310].map((x) => (
        <circle key={x} cx={x} cy="90" r="7" className="fill-gold" />
      ))}
      {[90, 310].map((x) => (
        <circle key={x} cx={x} cy="165" r="7" className="fill-gold" />
      ))}
    </g>
  ),
  electric: (
    <g>
      <rect x="80" y="60" width="160" height="190" rx="10" className="fill-white stroke-navy" strokeWidth="6" />
      {[95, 135, 175].map((y) => (
        <g key={y}>
          {[105, 140, 175, 210].map((x) => (
            <rect key={x} x={x - 10} y={y} width="20" height="28" rx="3" className="fill-navy" />
          ))}
        </g>
      ))}
      <path d="M240 120 C 290 120 280 200 330 200" className="fill-none stroke-teal" strokeWidth="6" />
      <path d="M300 60 l-30 60 h30 l-22 60 52 -76 h-32 l22 -44z" className="fill-gold" />
    </g>
  ),
  lift: (
    <g>
      <path d="M200 30 V120" className="stroke-navy" strokeWidth="6" />
      <path d="M200 120 a22 22 0 1 0 22 22" className="fill-none stroke-navy" strokeWidth="10" strokeLinecap="round" />
      <path d="M200 150 L130 200 M200 150 L270 200" className="stroke-gold" strokeWidth="6" />
      <rect x="110" y="200" width="180" height="50" rx="6" className="fill-navy" />
      <path d="M130 225 h140" className="stroke-teal" strokeWidth="4" strokeDasharray="12 10" />
    </g>
  ),
  scaffold: (
    <g>
      <path d="M100 250 V60 M200 250 V60 M300 250 V60 M90 110 H310 M90 180 H310 M90 250 H310" className="fill-none stroke-navy" strokeWidth="8" />
      <path d="M100 180 L200 110 M200 250 L300 180" className="stroke-teal" strokeWidth="5" />
      <rect x="95" y="100" width="210" height="10" className="fill-gold" />
      <rect x="95" y="170" width="210" height="10" className="fill-gold" />
      <path d="M232 92 a22 20 0 0 1 44 0z" className="fill-gold" />
    </g>
  ),
  gear: (
    <g>
      <circle cx="170" cy="150" r="62" className="fill-none stroke-navy" strokeWidth="26" strokeDasharray="20 12" />
      <circle cx="170" cy="150" r="48" className="fill-navy" />
      <circle cx="170" cy="150" r="18" className="fill-white" />
      <path d="M250 230 L310 170" className="stroke-teal" strokeWidth="16" strokeLinecap="round" />
      <path d="M300 150 a26 26 0 1 0 30 30 l-14 -4 -6 -12 z" className="fill-gold" />
    </g>
  ),
  inspect: (
    <g>
      <rect x="60" y="180" width="240" height="34" rx="3" className="fill-navy" />
      <path d="M60 180 h240" className="stroke-gold" strokeWidth="6" strokeDasharray="14 6" />
      <circle cx="210" cy="120" r="54" className="fill-white stroke-navy" strokeWidth="10" />
      <path d="M170 122 l14 -16 14 30 14 -40 14 26 10 -6" className="fill-none stroke-teal" strokeWidth="5" strokeLinejoin="round" />
      <path d="M250 160 l50 50" className="stroke-navy" strokeWidth="16" strokeLinecap="round" />
    </g>
  ),
  safety: (
    <g>
      <path d="M200 50 L290 85 V150 C290 205 250 235 200 255 C150 235 110 205 110 150 V85 Z" className="fill-navy" />
      <path d="M160 150 l28 28 54 -60" className="fill-none stroke-gold" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  learn: (
    <g>
      <rect x="90" y="60" width="200" height="170" rx="8" className="fill-white stroke-navy" strokeWidth="6" />
      <path d="M120 100 h140 M120 130 h140 M120 160 h90" className="stroke-navy" strokeWidth="6" strokeLinecap="round" />
      <path d="M262 200 l-12 50 22 -12 22 12 -12 -50" className="fill-teal" />
      <circle cx="272" cy="196" r="26" className="fill-gold" />
    </g>
  ),
};

export function ServiceIllustration({ iconName, className, label }: { iconName?: string | null; className?: string; label?: string }) {
  const motif = iconName ? MOTIF_BY_ICON[iconName] : undefined;
  const gridId = `svc-grid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-teal-soft", className)} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      <svg viewBox="0 0 400 300" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" className="fill-none stroke-navy/10" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="400" height="300" fill={`url(#${gridId})`} />
        <circle cx="330" cy="60" r="90" className="fill-white/50" />
        <path d="M0 262 H400" className="stroke-navy/20" strokeWidth="2" />
        {motif ? (
          MOTIFS[motif]
        ) : (
          <g>
            <circle cx="200" cy="150" r="80" className="fill-navy" />
          </g>
        )}
      </svg>
      {motif ? null : (
        <span className="absolute inset-0 flex items-center justify-center text-white">
          <CmsIcon name={iconName} className="size-16" />
        </span>
      )}
    </div>
  );
}
