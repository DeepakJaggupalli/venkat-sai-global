import { BadgeCheck, Briefcase, Compass, Globe2, GraduationCap, Layers, ShieldCheck, TrendingUp } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/config/site";
import type { TFunction } from "@/i18n/server";
import { cn } from "@/lib/utils";

/** Brand lockup; decorative because every link around it carries an accessible name. */
export function Wordmark({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return <Logo variant={inverted ? "onDark" : "onLight"} decorative className={cn("h-8 w-auto", className)} />;
}

const PROMISES = [
  { key: "platform", icon: Layers },
  { key: "opportunity", icon: Globe2 },
  { key: "trusted", icon: ShieldCheck },
] as const;

const JOURNEY = [
  { key: "discover", icon: Compass },
  { key: "learn", icon: GraduationCap },
  { key: "qualify", icon: BadgeCheck },
  { key: "work", icon: Briefcase },
  { key: "grow", icon: TrendingUp },
] as const;

/** Left-hand brand panel of the auth layout (large screens). */
export function BrandPanel({ t }: { t: TFunction }) {
  return (
    <aside
      aria-label={t("brand.asideLabel")}
      className="relative hidden overflow-hidden bg-navy-deep text-white lg:flex lg:flex-col lg:justify-between lg:gap-10 lg:p-10 xl:p-14"
    >
      <div aria-hidden className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-teal/10 blur-3xl" />
      <Link href="/" className="relative w-fit rounded-md focus-visible:outline-offset-4">
        <Wordmark inverted />
        <span className="sr-only">{t("layout.home")}</span>
      </Link>

      <div className="relative max-w-md space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold tracking-widest text-teal uppercase">{t("brand.category")}</p>
          <p className="font-heading text-3xl leading-tight font-bold text-balance xl:text-4xl">{t("brand.statement")}</p>
        </div>
        <ul className="space-y-5">
          {PROMISES.map(({ key, icon: Icon }) => (
            <li key={key} className="flex gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-white/10">
                <Icon className="size-5 text-teal" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">{t(`brand.promise.${key}.title`)}</p>
                <p className="text-sm text-white/75">{t(`brand.promise.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative space-y-4">
        <p className="text-sm font-medium text-white/85">{t("brand.journeyLabel")}</p>
        <ol className="flex flex-wrap gap-2">
          {JOURNEY.map(({ key, icon: Icon }) => (
            <li key={key} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm">
              <Icon className="size-3.5 text-teal" aria-hidden />
              {t(`brand.journey.${key}`)}
            </li>
          ))}
        </ol>
        <p className="text-xs text-white/60">
          {BRAND.legalEntity} · {BRAND.headquarters}
        </p>
      </div>
    </aside>
  );
}
