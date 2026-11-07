"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { Sheet } from "@/components/ui/sheet";
import { NAVIGATION, PORTAL_HOME, PORTAL_LABEL, type NavItem, type NavSection, type PortalKey } from "@/config/navigation";
import { BRAND } from "@/config/site";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

import { buildAutoTrail, filterNavSections, findActiveNavItem, isNavItemExact, navSectionI18nKey } from "./nav-utils";
import { OrgSwitcher } from "./org-switcher";
import { BreadcrumbTrailContext, ShellBreadcrumbs } from "./portal-breadcrumb";
import { isOrgPortal, LAST_PORTAL_COOKIE, PORTAL_NOTIFICATIONS_HREF, PORTAL_SUPPORT_HREF, SIDEBAR_COOKIE } from "./portal-config";
import { PortalMobileNav } from "./portal-mobile-nav";
import { DesktopSidebar } from "./portal-sidebar";
import { PortalTopbar } from "./portal-topbar";
import { ShellLangContext, useShellT } from "./shell-i18n";
import { SHELL_CONTENT_CLASS, SIDEBAR_WIDTH } from "./shell-styles";
import type { BreadcrumbEntry, PortalLink, ShellMembership, ShellOrganization, ShellUser } from "./types";

export type PortalShellProps = {
  portal: PortalKey;
  user: ShellUser;
  /** Portals the user can open (portal switcher). */
  portals: readonly PortalLink[];
  /**
   * Permission keys of the viewer (organisation role permissions, or staff permissions).
   * Navigation items with a `permission` are hidden unless it is listed; items without one always show.
   */
  permissions?: readonly string[];
  /** Org portals: the active organisation and the user's memberships of the same type. */
  organization?: ShellOrganization | null;
  memberships?: readonly ShellMembership[];
  /** People Portal locale (labels are translated only in the talent portal). */
  locale?: Locale;
  /** Initial desktop sidebar state (from the `vsg_sidebar` cookie). */
  defaultCollapsed?: boolean;
  /** Rendered at the top of <main>, above the page (e.g. the organisation status banner). */
  banner?: ReactNode;
  children: ReactNode;
};

const NO_PERMISSIONS: readonly string[] = [];
const NO_MEMBERSHIPS: readonly ShellMembership[] = [];
const SIDEBAR_ID = "portal-sidebar";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Best-effort preference cookie (blocked cookies just mean the preference is not remembered). */
function writePreferenceCookie(name: string, value: string): void {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
  } catch {
    // Ignore: storage may be disabled by the browser or a privacy extension.
  }
}

/**
 * Application frame shared by the People, Employer, Partner, Institution portals and the Command Centre:
 * permission-filtered sidebar (collapsible on desktop, drawer on mobile), sticky top bar with breadcrumb,
 * portal switcher, help, notifications and account menu, and the `<main id="main-content">` landmark.
 * Pages render inside a padded content column — do not add `.container-page` in portal pages.
 */
export function PortalShell({
  portal,
  user,
  portals,
  permissions = NO_PERMISSIONS,
  organization = null,
  memberships = NO_MEMBERSHIPS,
  locale = DEFAULT_LOCALE,
  defaultCollapsed = false,
  banner,
  children,
}: PortalShellProps) {
  const t = useShellT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const translate = portal === "talent";

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [trail, setTrail] = useState<BreadcrumbEntry[] | null>(null);

  const sections = useMemo(() => filterNavSections(NAVIGATION[portal], permissions), [portal, permissions]);
  const activeItem = findActiveNavItem(sections, pathname, searchParams);
  const activeExact = activeItem ? isNavItemExact(activeItem, pathname, searchParams) : false;

  const homeHref = PORTAL_HOME[portal];
  const portalLabel = translate ? t(`portal.${portal}`, undefined, PORTAL_LABEL[portal]) : PORTAL_LABEL[portal];
  const homeLabel = `${BRAND.name}, ${t("shell.portalHome", { portal: portalLabel })}`;
  const labelFor = (item: NavItem): string => (translate && item.i18nKey ? t(item.i18nKey, undefined, item.title) : item.title);
  const sectionLabelFor = (section: NavSection): string => {
    if (!section.title) return "";
    return translate ? t(navSectionI18nKey(section.title), undefined, section.title) : section.title;
  };
  // The Command Centre's support page is the staff support desk, so only link it for staff who can use it.
  const helpHref = portal === "admin" && !permissions.includes("support.view") ? null : PORTAL_SUPPORT_HREF[portal];

  const crumbs: BreadcrumbEntry[] = trail
    ? [{ label: portalLabel, href: homeHref }, ...trail]
    : buildAutoTrail({
        homeLabel: portalLabel,
        homeHref,
        activeItem,
        activeLabel: activeItem ? labelFor(activeItem) : undefined,
        isExact: activeExact,
      });

  // Remember the portal so the account area can offer "Back to …".
  useEffect(() => {
    writePreferenceCookie(LAST_PORTAL_COOKIE, portal);
  }, [portal]);

  // Close the drawer if the viewport grows to the desktop layout while it is open.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    writePreferenceCookie(SIDEBAR_COOKIE, next ? "collapsed" : "expanded");
  }

  const closeMobile = () => setMobileOpen(false);
  const nav = { sections, activeHref: activeItem?.href ?? null, activeExact, labelFor, sectionLabelFor };
  const orgPortal = isOrgPortal(portal) ? portal : null;
  const lang = translate ? locale : "en";

  return (
    <ShellLangContext.Provider value={lang}>
      <BreadcrumbTrailContext.Provider value={setTrail}>
        <div
          lang={lang}
          data-portal={portal}
          className="min-h-dvh bg-surface-subtle"
          style={{ "--shell-sidebar": collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded } as CSSProperties}
        >
          <DesktopSidebar
            id={SIDEBAR_ID}
            homeHref={homeHref}
            homeLabel={homeLabel}
            portalLabel={portalLabel}
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            toggleLabel={collapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")}
            navLabel={t("shell.mainNavigation")}
            organization={
              orgPortal && organization ? (
                <OrgSwitcher portal={orgPortal} organization={organization} memberships={memberships} collapsed={collapsed} />
              ) : null
            }
            nav={nav}
          />

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <div className="flex min-h-dvh min-w-0 flex-col transition-[padding] duration-200 ease-out motion-reduce:transition-none lg:pl-(--shell-sidebar)">
              <PortalTopbar
                portal={portal}
                homeHref={homeHref}
                homeLabel={homeLabel}
                portalLabel={portalLabel}
                breadcrumb={<ShellBreadcrumbs entries={crumbs} label={t("shell.breadcrumb")} />}
                portals={portals}
                user={user}
                helpHref={helpHref}
                notificationsHref={PORTAL_NOTIFICATIONS_HREF[portal]}
                translate={translate}
                locale={locale}
              />
              <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col focus:outline-none">
                {banner}
                <div className={cn(SHELL_CONTENT_CLASS, "flex-1 py-6 sm:py-8")}>{children}</div>
              </main>
            </div>

            <PortalMobileNav
              currentPortal={portal}
              homeHref={homeHref}
              homeLabel={homeLabel}
              portalLabel={portalLabel}
              organization={
                orgPortal && organization ? (
                  <OrgSwitcher portal={orgPortal} organization={organization} memberships={memberships} onSwitched={closeMobile} />
                ) : null
              }
              nav={nav}
              portals={portals}
              helpHref={helpHref}
              translate={translate}
              onNavigate={closeMobile}
            />
          </Sheet>
        </div>
      </BreadcrumbTrailContext.Provider>
    </ShellLangContext.Provider>
  );
}
