"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";

import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavItem, NavSection } from "@/config/navigation";
import { cn } from "@/lib/utils";

import { useShellLang } from "./shell-i18n";
import { MICRO_LABEL_I18N } from "./shell-styles";

export type SidebarNavProps = {
  sections: readonly NavSection[];
  activeHref: string | null;
  activeExact: boolean;
  labelFor: (item: NavItem) => string;
  sectionLabelFor: (section: NavSection) => string;
  collapsed?: boolean;
  /** Called on client-side navigation (closes the mobile drawer). */
  onNavigate?: () => void;
};

function SidebarLink({
  item,
  label,
  active,
  exact,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  label: string;
  active: boolean;
  exact: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const lang = useShellLang();
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onNavigate={onNavigate}
      aria-current={active ? (exact ? "page" : "true") : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:-outline-offset-2",
        collapsed ? "mx-auto w-11 justify-center" : "px-3",
        active ? "bg-teal-soft text-navy" : "text-muted-foreground hover:bg-surface-subtle hover:text-navy",
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-teal" />}
      <Icon
        aria-hidden
        className={cn(
          "size-[18px] shrink-0 transition-colors",
          active ? "text-teal-strong" : "text-muted-foreground group-hover:text-navy",
        )}
      />
      <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} lang={lang}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarSection({ section, index, ...props }: SidebarNavProps & { section: NavSection; index: number }) {
  const headingId = useId();
  const { collapsed = false, activeHref, activeExact, labelFor, sectionLabelFor, onNavigate } = props;
  const title = section.title ? sectionLabelFor(section) : null;
  return (
    <li className={cn(index > 0 && (collapsed ? "mt-3 border-t border-border pt-3" : "mt-6"))}>
      {title && (
        <p
          id={headingId}
          className={cn(
            collapsed ? "sr-only" : "px-3 pb-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase",
            !collapsed && MICRO_LABEL_I18N,
          )}
        >
          {title}
        </p>
      )}
      <ul role="list" aria-labelledby={title ? headingId : undefined} className="space-y-0.5">
        {section.items.map((item) => (
          <li key={item.href}>
            <SidebarLink
              item={item}
              label={labelFor(item)}
              active={item.href === activeHref}
              exact={item.href === activeHref && activeExact}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
    </li>
  );
}

/** Permission-filtered navigation list (desktop sidebar and mobile drawer). */
export function SidebarNav(props: SidebarNavProps) {
  return (
    <ul role="list">
      {props.sections.map((section, index) => (
        <SidebarSection key={section.title ?? `section-${index}`} section={section} index={index} {...props} />
      ))}
    </ul>
  );
}

/** Small uppercase portal name with the gold accent dot. */
export function PortalBadge({ label, className }: { label: string; className?: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-teal-strong uppercase",
        MICRO_LABEL_I18N,
        className,
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold" />
      <span className="truncate">{label}</span>
    </p>
  );
}

export function SidebarBrand({
  homeHref,
  homeLabel,
  collapsed = false,
  onNavigate,
  className,
}: {
  homeHref: string;
  /** Accessible name of the home link, e.g. "Venkat Sai Global, People Portal home". */
  homeLabel: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <Link href={homeHref} aria-label={homeLabel} onNavigate={onNavigate} className={cn("flex min-w-0 items-center rounded-md", className)}>
      {collapsed ? <LogoMark decorative className="size-9" /> : <Logo decorative className="h-8 w-auto" />}
    </Link>
  );
}

/** Fixed desktop sidebar (lg+). Width follows the `--shell-sidebar` variable set by PortalShell. */
export function DesktopSidebar({
  id,
  homeHref,
  homeLabel,
  portalLabel,
  collapsed,
  onToggle,
  toggleLabel,
  navLabel,
  organization,
  nav,
}: {
  id: string;
  homeHref: string;
  homeLabel: string;
  portalLabel: string;
  collapsed: boolean;
  onToggle: () => void;
  toggleLabel: string;
  navLabel: string;
  organization?: ReactNode;
  nav: Omit<SidebarNavProps, "collapsed" | "onNavigate">;
}) {
  return (
    <div
      id={id}
      data-collapsed={collapsed || undefined}
      className="fixed inset-y-0 left-0 z-30 hidden w-(--shell-sidebar) flex-col border-r border-border bg-white transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex"
    >
      <div className={cn("flex h-16 shrink-0 items-center border-b border-border", collapsed ? "justify-center px-2" : "px-5")}>
        <SidebarBrand homeHref={homeHref} homeLabel={homeLabel} collapsed={collapsed} />
      </div>

      <div className={cn("shrink-0 space-y-3 pt-4", collapsed ? "px-2" : "px-4")}>
        {!collapsed && <PortalBadge label={portalLabel} className="px-1" />}
        {organization}
      </div>

      <nav
        aria-label={navLabel}
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 [scrollbar-width:thin]", collapsed ? "px-2" : "px-3")}
      >
        <SidebarNav {...nav} collapsed={collapsed} />
      </nav>

      <div className={cn("shrink-0 border-t border-border p-3", collapsed && "flex justify-center px-2")}>
        <CollapseButton collapsed={collapsed} onToggle={onToggle} label={toggleLabel} />
      </div>
    </div>
  );
}

/** The label itself states the action ("Collapse sidebar" / "Expand sidebar"), so no aria-expanded is needed. */
function CollapseButton({ collapsed, onToggle, label }: { collapsed: boolean; onToggle: () => void; label: string }) {
  const lang = useShellLang();
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const button = (
    <Button
      type="button"
      variant="ghost"
      onClick={onToggle}
      className={cn("h-10 text-muted-foreground hover:text-navy", collapsed ? "w-11 px-0" : "w-full justify-start gap-2.5 px-3")}
    >
      <Icon className="size-[18px]" aria-hidden />
      <span className={cn(collapsed && "sr-only")}>{label}</span>
    </Button>
  );
  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} lang={lang}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
