import { Globe2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Country flags as real SVG images (public/flags/<iso2>.svg, from flagcdn.com, public-domain designs), because
 * Windows cannot render flag emoji. Decorative by default (alt=""): always place the country name next to it.
 */

/** ISO alpha-2 codes with a file in public/flags. */
export const FLAG_CODES: ReadonlySet<string> = new Set(
  "ae at au bd be bg bh bn br ca ch cn cy cz de dk ee eg es fi fr gb gr hk hr hu id ie il in iq it jo jp ke kr kw lb lk lt lu lv mt mu mv mx my ng nl no np nz om ph pl pt qa ro rs ru sa se sg si sk th tr tw tz ua us vn za".split(" "),
);

export function flagSrc(countryCode: string | null | undefined): string | null {
  const code = countryCode?.trim().toLowerCase();
  return code && /^[a-z]{2}$/.test(code) && FLAG_CODES.has(code) ? `/flags/${code}.svg` : null;
}

export function Flag({ code, className, label }: { code: string | null | undefined; className?: string; /** Accessible name when no country name is shown next to it. */ label?: string }) {
  const src = flagSrc(code);
  if (!src) {
    return <Globe2 aria-hidden={label ? undefined : true} aria-label={label} className={cn("h-4 w-auto text-muted-foreground", className)} />;
  }
  return (
    // Plain <img>: tiny static SVGs need no optimisation (next/image does not optimise SVG).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label ?? ""}
      width={24}
      height={16}
      loading="lazy"
      decoding="async"
      className={cn("inline-block h-4 w-6 shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_rgb(10_10_11/0.08)]", className)}
    />
  );
}
