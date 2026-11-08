import { BadgeCheck, Briefcase, Compass, Globe2, GraduationCap, Layers, ShieldCheck, TrendingUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/config/site";
import { IMAGE_CREDITS } from "@/content/image-credits";
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

const PANEL_PHOTO = IMAGE_CREDITS.find((c) => c.src === "/images/stock/welding-3.webp");

/** Left-hand brand panel of the auth layout (large screens): light grey, one photograph, the promises. */
export function BrandPanel({ t }: { t: TFunction }) {
  return (
    <aside
      aria-label={t("brand.asideLabel")}
      className="relative hidden overflow-hidden border-r border-border bg-surface-subtle text-foreground lg:flex lg:flex-col lg:justify-between lg:gap-10 lg:p-10 xl:p-14"
    >
      <Link href="/" className="relative w-fit rounded-md focus-visible:outline-offset-4">
        <Wordmark />
        <span className="sr-only">{t("layout.home")}</span>
      </Link>

      <div className="relative max-w-lg space-y-8">
        {PANEL_PHOTO ? (
          <div className="relative aspect-[16/10] overflow-hidden rounded-3xl border border-border bg-white shadow-card">
            <Image src={PANEL_PHOTO.src} alt="" fill sizes="(min-width: 1024px) 36vw, 1px" className="object-cover" priority />
          </div>
        ) : null}
        <div className="space-y-3">
          <p className="label-dot">{t("brand.category")}</p>
          <p className="font-display text-3xl text-balance xl:text-[2.5rem]">{t("brand.statement")}</p>
        </div>
        <ul className="space-y-4">
          {PROMISES.map(({ key, icon: Icon }) => (
            <li key={key} className="flex gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-border bg-white">
                <Icon className="size-4 text-teal-strong" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">{t(`brand.promise.${key}.title`)}</p>
                <p className="text-sm text-muted-foreground">{t(`brand.promise.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative space-y-4">
        <p className="text-sm font-medium text-foreground">{t("brand.journeyLabel")}</p>
        <ol className="flex flex-wrap gap-2">
          {JOURNEY.map(({ key, icon: Icon }) => (
            <li key={key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-sm">
              <Icon className="size-3.5 text-teal-strong" aria-hidden />
              {t(`brand.journey.${key}`)}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          {BRAND.legalEntity} · {BRAND.headquarters}
        </p>
      </div>
    </aside>
  );
}
