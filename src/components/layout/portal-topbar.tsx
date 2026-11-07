"use client";

import { CircleHelp, Menu } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { Button } from "@/components/ui/button";
import { SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PortalKey } from "@/config/navigation";
import { BRAND } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

import { NotificationBell } from "./notification-bell";
import { PortalSwitcher } from "./portal-switcher";
import { useShellLang, useShellT } from "./shell-i18n";
import { MICRO_LABEL_I18N, SHELL_CONTENT_CLASS, TOPBAR_ICON_BUTTON } from "./shell-styles";
import type { PortalLink, ShellUser } from "./types";
import { UserMenu } from "./user-menu";

export type PortalTopbarProps = {
  portal: PortalKey;
  homeHref: string;
  homeLabel: string;
  portalLabel: string;
  /** Breadcrumb row (lg+, where the sidebar shows the brand). */
  breadcrumb: ReactNode;
  portals: readonly PortalLink[];
  user: ShellUser;
  helpHref: string | null;
  notificationsHref: string;
  /** People Portal: translated labels + language switcher. */
  translate: boolean;
  locale: Locale;
};

/** Sticky top bar: menu button + brand (mobile), breadcrumb (desktop), portal tools and account menu. */
export function PortalTopbar({
  portal,
  homeHref,
  homeLabel,
  portalLabel,
  breadcrumb,
  portals,
  user,
  helpHref,
  notificationsHref,
  translate,
  locale,
}: PortalTopbarProps) {
  const t = useShellT();
  const lang = useShellLang();
  const helpLabel = t("shell.help");

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
      <div className={cn(SHELL_CONTENT_CLASS, "flex h-16 items-center gap-1.5 sm:gap-3")}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className={cn(TOPBAR_ICON_BUTTON, "-ml-2.5 lg:hidden")} aria-label={t("shell.openMenu")}>
            <Menu aria-hidden />
          </Button>
        </SheetTrigger>

        <Link href={homeHref} className="flex min-w-0 items-center gap-2.5 rounded-md lg:hidden">
          {/* Name from content, not aria-label: the brand and portal names are visible text (WCAG 2.5.3 label in name). */}
          <span className="sr-only">{homeLabel}</span>
          <LogoMark decorative className="size-8" />
          {/* The People Portal also fits a language switcher, so its name text waits for 400px. */}
          <span aria-hidden className={cn("min-w-0 flex-col leading-tight", translate ? "hidden min-[400px]:flex" : "flex")}>
            <span className="truncate font-heading text-[13px] font-bold text-navy">{BRAND.name}</span>
            <span className={cn("truncate text-[11px] font-medium text-muted-foreground", MICRO_LABEL_I18N)}>{portalLabel}</span>
          </span>
        </Link>

        <div className="hidden min-w-0 flex-1 lg:block">{breadcrumb}</div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          {portals.length > 0 && (
            <PortalSwitcher current={portal} portals={portals} translate={translate} className="hidden sm:inline-flex" />
          )}
          {helpHref && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="ghost" size="icon" className={cn(TOPBAR_ICON_BUTTON, "hidden sm:inline-flex")}>
                  <Link href={helpHref} aria-label={helpLabel}>
                    <CircleHelp aria-hidden />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" lang={lang}>
                {helpLabel}
              </TooltipContent>
            </Tooltip>
          )}
          {translate && <LanguageSwitcher locale={locale} compact />}
          <NotificationBell viewAllHref={notificationsHref} />
          <UserMenu user={user} helpHref={helpHref} className="ml-0.5 sm:ml-1.5" />
        </div>
      </div>
    </header>
  );
}
