"use client";

import { Globe, LifeBuoy, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { PortalKey } from "@/config/navigation";
import { cn } from "@/lib/utils";

import { PORTAL_ICONS, usePortalLabel } from "./portal-switcher";
import { PortalBadge, SidebarBrand, SidebarNav, type SidebarNavProps } from "./portal-sidebar";
import { useShellLang, useShellT } from "./shell-i18n";
import { MICRO_LABEL_I18N, TOPBAR_ICON_BUTTON } from "./shell-styles";
import type { PortalLink } from "./types";

const DRAWER_LINK =
  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-navy focus-visible:-outline-offset-2";

/** Navigation drawer for small screens (< lg). Must be rendered inside the shell's <Sheet>. */
export function PortalMobileNav({
  currentPortal,
  homeHref,
  homeLabel,
  portalLabel,
  organization,
  nav,
  portals,
  helpHref,
  translate,
  onNavigate,
}: {
  currentPortal: PortalKey;
  homeHref: string;
  homeLabel: string;
  portalLabel: string;
  organization?: ReactNode;
  nav: Omit<SidebarNavProps, "collapsed" | "onNavigate">;
  portals: readonly PortalLink[];
  helpHref: string | null;
  translate: boolean;
  onNavigate: () => void;
}) {
  const t = useShellT();
  const lang = useShellLang();
  const portalLabelFor = usePortalLabel(translate);
  const otherPortals = portals.filter((link) => link.portal !== currentPortal);
  const navLabel = t("shell.mainNavigation");

  return (
    <SheetContent
      side="left"
      lang={lang}
      showCloseButton={false}
      aria-describedby={undefined}
      className="gap-0 p-0 data-[side=left]:w-[88vw] data-[side=left]:max-w-[22rem] data-[side=left]:sm:max-w-[22rem]"
    >
      <SheetTitle className="sr-only">{navLabel}</SheetTitle>
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <SidebarBrand homeHref={homeHref} homeLabel={homeLabel} onNavigate={onNavigate} />
        <SheetClose asChild>
          <Button variant="ghost" size="icon" className={cn(TOPBAR_ICON_BUTTON, "-mr-2")} aria-label={t("shell.closeMenu")}>
            <X aria-hidden />
          </Button>
        </SheetClose>
      </div>

      <div className="shrink-0 space-y-3 px-4 pt-4">
        <PortalBadge label={portalLabel} className="px-1" />
        {organization}
      </div>

      <nav aria-label={navLabel} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        <SidebarNav {...nav} onNavigate={onNavigate} />
      </nav>

      {(helpHref || otherPortals.length > 0) && (
        <div className="shrink-0 border-t border-border p-3">
          {helpHref && (
            <Link href={helpHref} onNavigate={onNavigate} className={DRAWER_LINK}>
              <LifeBuoy className="size-[18px]" aria-hidden />
              {t("shell.helpAndSupport")}
            </Link>
          )}
          {otherPortals.length > 0 && (
            <>
              <p
                className={cn(
                  "px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase",
                  MICRO_LABEL_I18N,
                )}
              >
                {t("shell.switchPortal")}
              </p>
              <ul role="list">
                {otherPortals.map((link) => {
                  const Icon = PORTAL_ICONS[link.portal];
                  return (
                    <li key={link.portal}>
                      <Link href={link.href} onNavigate={onNavigate} className={DRAWER_LINK}>
                        <Icon className="size-[18px]" aria-hidden />
                        {portalLabelFor(link)}
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <Link href="/" onNavigate={onNavigate} className={DRAWER_LINK}>
                    <Globe className="size-[18px]" aria-hidden />
                    {t("portal.website")}
                  </Link>
                </li>
              </ul>
            </>
          )}
        </div>
      )}
    </SheetContent>
  );
}
