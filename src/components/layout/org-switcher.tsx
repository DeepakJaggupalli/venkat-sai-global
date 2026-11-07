"use client";

import { ChevronsUpDown, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { switchOrganization } from "./actions";
import { ORG_TYPE_BY_PORTAL, type OrgPortalKey } from "./portal-config";
import { useShellLang, useShellT } from "./shell-i18n";
import type { ShellMembership, ShellOrganization } from "./types";

function OrgAvatar({ name, tone = "solid", className }: { name: string; tone?: "solid" | "soft"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg font-heading text-xs font-bold tracking-wide",
        tone === "solid" ? "bg-navy text-white" : "bg-teal-soft text-accent-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The organisation the member is working in. With more than one membership of this portal's type it
 * becomes a menu; choosing another organisation calls `switchOrganization` (membership re-verified on
 * the server) and opens that organisation's dashboard.
 */
export function OrgSwitcher({
  portal,
  organization,
  memberships,
  collapsed = false,
  onSwitched,
}: {
  portal: OrgPortalKey;
  organization: ShellOrganization;
  memberships: readonly ShellMembership[];
  collapsed?: boolean;
  /** Called after a successful switch (e.g. to close the mobile drawer). */
  onSwitched?: () => void;
}) {
  const t = useShellT();
  const lang = useShellLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canSwitch = memberships.some((m) => m.organizationId !== organization.id);

  function switchTo(organizationId: string) {
    if (organizationId === organization.id || pending) return;
    startTransition(async () => {
      const result = await switchOrganization({ orgType: ORG_TYPE_BY_PORTAL[portal], organizationId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      onSwitched?.();
      router.push(result.data?.href ?? "/");
    });
  }

  const details = (
    <span className={cn("min-w-0 flex-1 text-left", collapsed && "sr-only")}>
      <span className="block truncate text-sm font-semibold text-navy">{organization.name}</span>
      <span className="block truncate text-xs text-muted-foreground">{organization.roleName}</span>
    </span>
  );

  if (!canSwitch) {
    const card = (
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-border bg-white",
          collapsed ? "justify-center border-transparent bg-transparent p-0" : "p-2",
        )}
      >
        <span className="sr-only">{t("shell.currentOrganisation")}: </span>
        <OrgAvatar name={organization.name} />
        {details}
      </div>
    );
    if (!collapsed) return card;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="right" lang={lang}>
          {organization.name}
        </TooltipContent>
      </Tooltip>
    );
  }

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl border border-border bg-white text-left transition-colors hover:bg-surface-subtle disabled:opacity-70 data-[state=open]:bg-surface-subtle",
          collapsed ? "justify-center border-transparent bg-transparent p-0.5" : "p-2",
        )}
      >
        <span className="sr-only">{t("shell.switchOrganisation")}: </span>
        <OrgAvatar name={organization.name} />
        {details}
        {!collapsed &&
          (pending ? (
            <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ))}
      </button>
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" lang={lang}>
            {organization.name}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="start" side={collapsed ? "right" : "bottom"} sideOffset={8} lang={lang} className="w-72 p-1.5">
        <DropdownMenuLabel className="px-2 pt-1.5 pb-2">{t("shell.yourOrganisations")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={organization.id} onValueChange={switchTo}>
          {memberships.map((membership) => (
            <DropdownMenuRadioItem
              key={membership.organizationId}
              value={membership.organizationId}
              disabled={pending}
              className="gap-3 rounded-lg py-2 pr-8 pl-2"
            >
              <OrgAvatar name={membership.organizationName} tone="soft" className="size-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-navy">{membership.organizationName}</span>
                <span className="block truncate text-xs text-muted-foreground">{membership.roleName}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
