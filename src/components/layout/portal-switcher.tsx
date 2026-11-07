"use client";

import { Building2, Check, Globe, GraduationCap, Handshake, LayoutGrid, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PortalKey } from "@/config/navigation";
import { cn } from "@/lib/utils";

import { useShellLang, useShellT } from "./shell-i18n";
import { TOPBAR_ICON_BUTTON } from "./shell-styles";
import type { PortalLink } from "./types";

export const PORTAL_ICONS: Record<PortalKey, LucideIcon> = {
  talent: UserRound,
  employer: Building2,
  recruiter: Handshake,
  institution: GraduationCap,
  admin: ShieldCheck,
};

/** Label for a portal; translated in the People Portal, English elsewhere. */
export function usePortalLabel(translate: boolean): (link: Pick<PortalLink, "portal" | "label">) => string {
  const t = useShellT();
  return (link) => (translate ? t(`portal.${link.portal}`, undefined, link.label) : link.label);
}

/**
 * Lists every portal the user can open (People Portal always; employer / partner / institution by
 * membership; Command Centre for staff) plus the public website.
 */
export function PortalSwitcher({
  current,
  portals,
  translate = false,
  className,
}: {
  current: PortalKey;
  portals: readonly PortalLink[];
  translate?: boolean;
  className?: string;
}) {
  const t = useShellT();
  const lang = useShellLang();
  const portalLabel = usePortalLabel(translate);
  const label = t("shell.switchPortal");

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={label} className={cn(TOPBAR_ICON_BUTTON, className)}>
              <LayoutGrid aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" lang={lang}>
          {label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={8} lang={lang} className="w-72 p-1.5">
        <DropdownMenuLabel className="px-2 pt-1.5 pb-2">{t("shell.yourPortals")}</DropdownMenuLabel>
        {portals.map((link) => {
          const Icon = PORTAL_ICONS[link.portal];
          const isCurrent = link.portal === current;
          return (
            <DropdownMenuItem key={link.portal} asChild className="gap-3 rounded-lg px-2 py-2">
              <Link href={link.href} aria-current={isCurrent ? "page" : undefined}>
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg text-navy",
                    isCurrent ? "bg-teal-soft ring-1 ring-teal/30" : "bg-surface-subtle",
                  )}
                  aria-hidden
                >
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-navy">{portalLabel(link)}</span>
                  {isCurrent && <span className="block text-xs text-muted-foreground">{t("shell.currentPortal")}</span>}
                </span>
                {isCurrent && <Check className="size-4 text-teal-strong" aria-hidden />}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuItem asChild className="gap-3 rounded-lg px-2 py-2">
          <Link href="/">
            <span className="flex size-9 items-center justify-center rounded-lg bg-surface-subtle text-navy" aria-hidden>
              <Globe className="size-[18px]" />
            </span>
            <span className="text-sm font-medium text-navy">{t("portal.website")}</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
