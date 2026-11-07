# Layout shells (`src/components/layout`)

The frames every screen of Venkat Sai Global renders inside: the public website header and footer,
the shared portal shell (People Portal, Employer Portal, Partner Portal, Institution Portal and
Command Centre) and the account-area shell. Owner: design system (shell). Brand artwork lives in
[`src/components/brand`](../brand/README.md).

## Where it is used

| Route group | Layout file | Shell |
|---|---|---|
| `/` public site | `src/app/(public)/layout.tsx` | `PublicHeader` + `<main id="main-content">` + `PublicFooter` |
| `/talent/**` | `src/app/talent/layout.tsx` | `requireUser()` → `I18nProvider` (common + talent-*) → `PortalShell portal="talent"` |
| `/employer/**` (except onboarding) | `src/app/employer/(workspace)/layout.tsx` | flag → `requireOrgMember("employer")` → `OrgPortalFrame` |
| `/recruiter/**` (except onboarding) | `src/app/recruiter/(workspace)/layout.tsx` | flag → `requireOrgMember("recruitment_partner")` → `OrgPortalFrame` |
| `/institution/**` (except onboarding) | `src/app/institution/(workspace)/layout.tsx` | flag → `requireOrgMember("institution")` → `OrgPortalFrame` |
| `/admin/**` | `src/app/admin/layout.tsx` | `requireStaff()` → `PortalShell portal="admin"` (staff permissions) |
| `/account/**` | `src/app/account/layout.tsx` | `requireUser()` → `AccountShell` |

Layouts authorise once, but **pages and actions must still call their own guard** (layouts do not
protect Server Actions). Portal layouts 404 when the portal's feature flag (`portal.<x>`) is off.
`/employer/onboarding`, `/recruiter/onboarding` and `/institution/onboarding` sit outside `(workspace)`
and therefore render without the shell.

## Contract for portal pages

- Pages render inside a padded content column (`SHELL_CONTENT_CLASS`: `max-w-[96rem]`, `px-4 sm:px-6 lg:px-8`,
  `py-6 sm:py-8`). **Do not add `.container-page`** inside portal pages. Each page owns its `<h1>`.
- The top bar shows an automatic breadcrumb (portal home → active sidebar section). For deeper pages render
  `<PortalBreadcrumb items={[{ label: "Jobs", href: "/employer/jobs" }, { label: job.title }]} />`
  anywhere in the page (start below the portal home; the last item has no `href`).
- Sidebar items come from `NAVIGATION[portal]` (`src/config/navigation.ts`), filtered by the permission list
  the layout passes. Items without `permission` always show. Active state = most specific match; honours
  `matchNested: false` and query-string hrefs (`/admin/organizations?type=employer`). The active link gets
  `aria-current="page"` (exact) or `"true"` (ancestor).
- People Portal labels are translated from `common` (`nav.*`, `nav.section.<slug>`, `portal.*`); every other
  portal is English and sets `lang="en"` on the shell. Radix portals (menus, popovers, tooltips, sheets) render
  under `<body>`, outside that wrapper, so shell surfaces set `lang={useShellLang()}` themselves — do the same in
  page-level dialogs/menus if they must not inherit the cookie-based `<html lang>`.
- Small tracked/uppercase labels that can show Hindi or Telugu use `MICRO_LABEL_I18N` (normal tracking, 12px for
  non-English): letter-spacing breaks Indic glyph clusters.
- Each portal has a `loading.tsx` using `PortalPageSkeleton`. The `page.tsx` files in this ownership are
  **placeholders** (honest "being set up" dashboards with real names and quick links) — portal teams replace them.

## Public API

### Public website

```ts
// client
PublicHeader(props: {
  navItems?: readonly PublicNavItem[];          // default PUBLIC_NAV (CMS later)
  announcement?: Announcement | null;           // { id, message, href?, linkLabel?, tone?: "neutral"|"highlight"|"critical", dismissible? }
  account?: HeaderAccount | null;               // { name, href, portalLabel } — swaps Sign in / Join for "Go to <portal>"
}): JSX.Element
AnnouncementBar(props: { announcement: Announcement }): JSX.Element | null   // dismissal kept in localStorage per id

// server
PublicFooter(props: {
  columns?: readonly FooterColumn[];            // default DEFAULT_FOOTER_COLUMNS (derived from PUBLIC_NAV)
  contact?: FooterContact | null;               // { address?, email?, phone?, whatsapp?, hours? } — only supplied fields render
  social?: readonly SocialLink[];               // { platform, href, label? } — http(s) only
  legalEntity?: string;                         // default BRAND.legalEntity
  legalLinks?: readonly FooterLink[];           // default DEFAULT_LEGAL_LINKS
}): JSX.Element
```

Header: navy utility row (xl+: brand category, "Post a Requirement" → `/employers/request`, "Sign in" →
`/sign-in`) that scrolls away, then a sticky main row (logo, `NavigationMenu` dropdowns, "Join Venkat Sai" →
`/sign-up`) that turns translucent on scroll. Top-level items that do not fit the bar move into **More**
(estimated from label length — CMS labels can never cause horizontal scroll). Below xl a `Sheet` holds the
navigation (collapsible groups) and all three calls to action. All CMS links are sanitised: internal paths
or `http(s)` URLs only; external links open in a new tab with an announced hint.

### Portal shell

```ts
// client
PortalShell(props: {
  portal: PortalKey;                            // "talent" | "employer" | "recruiter" | "institution" | "admin"
  user: ShellUser;                              // { name, email, phone, avatarUrl }
  portals: readonly PortalLink[];               // portal switcher entries
  permissions?: readonly string[];              // org role permissions or staff permissions
  organization?: ShellOrganization | null;      // org portals: { id, name, type, status, roleName }
  memberships?: readonly ShellMembership[];     // same-type memberships for the organisation switcher
  locale?: Locale;                              // People Portal language
  defaultCollapsed?: boolean;                   // desktop sidebar (cookie vsg_sidebar)
  banner?: ReactNode;                           // rendered at the top of <main> (org status banner)
  children: ReactNode;
}): JSX.Element

PortalBreadcrumb(props: { items: readonly BreadcrumbEntry[] }): null      // page → top bar breadcrumb
NotificationBell(props: { viewAllHref: string; className?: string }): JSX.Element
PortalSwitcher(props: { current: PortalKey; portals: readonly PortalLink[]; translate?: boolean; className?: string }): JSX.Element
OrgSwitcher(props: { portal: OrgPortalKey; organization: ShellOrganization; memberships: readonly ShellMembership[]; collapsed?: boolean; onSwitched?: () => void }): JSX.Element
UserMenu(props: { user: ShellUser; helpHref?: string | null; className?: string }): JSX.Element
OrgStatusBanner(props: { portal: OrgPortalKey; status: OrgStatus }): JSX.Element | null
PortalPageSkeleton(props: { cards?: number; rows?: number }): JSX.Element
useShellT(): (key: string, vars?: Record<string, string | number>, fallback?: string) => string   // "common", English fallback
useShellLang(): string | undefined        // shell language; put lang={useShellLang()} on any Radix portal content you render in a portal

// server
OrgPortalFrame(props: { portal: OrgPortalKey; ctx: OrgContext; children: ReactNode }): Promise<JSX.Element>
orgPortalMetadata(portal: OrgPortalKey): Metadata                          // title template + noindex
PortalSetupDashboard(props: PortalSetupDashboardProps): JSX.Element        // placeholder dashboard (any portal)
BusinessSetupDashboard(props: { portal; userName; permissions; organizationName?; roleName? }): JSX.Element
AccountShell(props: { back: PortalLink | null; children: ReactNode }): JSX.Element
```

Shell anatomy: fixed white sidebar (lg+, 17rem / 4.75rem collapsed — icons with tooltips; state saved in the
`vsg_sidebar` cookie) with the logo, portal badge, organisation switcher and permission-filtered navigation;
`Sheet` drawer below lg (same content plus help and other portals). Sticky translucent top bar: menu button +
brand (mobile), breadcrumb (desktop), portal switcher, help (portal support page; Command Centre only with
`support.view`), language switcher (People Portal), notification bell, account menu.

- **NotificationBell** polls `GET /api/v1/notifications/summary` every 60 s while the tab is visible and on
  focus/visibility (5 s debounce), and on opening. Response contract (`notification-summary.ts`):
  `{ unreadCount: number, items: [{ id, title, body?, link?, createdAt, readAt? }] }`. 404 → stops polling,
  401/403 → pauses until focus, network/5xx → keeps last state; in each case the bell shows no count. Item links
  are followed only if they are relative in-app paths; otherwise the item opens the notification centre
  (`/talent/notifications` for candidates, `/account/notifications` for business portals). New unread
  notifications are announced through a polite live region.
- **UserMenu** shows name and email (or phone), links to `/account` and `/account/security`, help, and signs out
  with a real `<form method="post" action="/sign-out">` (kept mounted outside the menu, submitted with
  `requestSubmit()`).
- **OrgSwitcher** lists the user's active memberships of the portal's organisation type (radio items). Choosing
  one calls `switchOrganization` and navigates to that portal's home.
- **OrgStatusBanner** appears for every status except `verified` (draft, pending, under_review, rejected,
  suspended, expired), linking to `/employer/company/verification`, `/recruiter/profile/verification` or
  `/institution/profile/verification` (suspended: support first). Copy lives in `org-status.ts`.

### Server action (`actions.ts`)

```ts
switchOrganization(input: { orgType: OrgType; organizationId: string }): Promise<ActionResult<{ href: string }>>
```

Requires a signed-in user; re-verifies an **active** membership of a non-deleted organisation of that type
(`findActiveMembership`), then `setActiveOrganization(sessionId, orgType, id)`, audits
`organization.context_switched`, revalidates the portal layout and returns the portal home.

### Server helpers (`shell-data.ts`, `server-only`)

```ts
toShellUser(user: SessionUser): ShellUser
assertPortalEnabled(portal: "talent" | "employer" | "recruiter" | "institution", opts?: { organizationId?: string }): Promise<void>  // notFound() when off
getPortalLinks(user: SessionUser): Promise<PortalLink[]>                 // talent always, org portals by membership, admin for staff; flag-aware
getOrgShellData(ctx: OrgContext): Promise<{ organization: ShellOrganization; memberships: ShellMembership[] }>
findActiveMembership(userId: string, orgType: OrgType, organizationId: string): Promise<{ organizationId: string; organizationName: string } | null>
readSidebarCollapsed(): Promise<boolean>
readLastPortal(): Promise<PortalKey | null>
pickBackPortal(portals: readonly PortalLink[], lastPortal: PortalKey | null): PortalLink | null
getHeaderAccount(): Promise<HeaderAccount | null>                       // never throws
```

### Pure helpers (client-safe)

- `nav-utils.ts`: `filterNavSections`, `isNavItemActive`, `isNavItemExact`, `findActiveNavItem`, `splitHref`,
  `navSectionI18nKey`, `buildAutoTrail`, `quickLinks`, `safeInternalHref`, `isExternalHref`.
- `public-nav.ts`: `DEFAULT_PUBLIC_NAV`, `DEFAULT_FOOTER_COLUMNS`, `sanitizeHref`, `sanitizeNavItems`,
  `sanitizeFooterLinks`, `isCurrentPage`, `isSectionActive`, `estimateNavItemWidth`, `fitNavItems`, `desktopNavBudgets`.
- `org-status.ts`: `getOrgStatusNotice(status, portal)`.
- `notification-summary.ts`: `parseNotificationSummary(payload)`, types.
- `time.ts`: `formatRelativeTime(value, locale, now?)` (Intl, localised for hi/te).
- `portal-config.ts`: `PORTAL_SUPPORT_HREF`, `PORTAL_NOTIFICATIONS_HREF`, `VERIFICATION_HREF`, `ORG_TYPE_BY_PORTAL`,
  `PORTAL_BY_ORG_TYPE`, `PUBLIC_CTA`, `DEFAULT_LEGAL_LINKS`, `SIDEBAR_COOKIE`, `LAST_PORTAL_COOKIE`,
  `NOTIFICATION_SUMMARY_ENDPOINT`, `isOrgPortal`.
- `shell-styles.ts`: `SHELL_CONTENT_CLASS`, `SIDEBAR_WIDTH`, `TOPBAR_ICON_BUTTON`, `MICRO_LABEL_I18N`.
- `shell-i18n.ts` (client): `useShellT`, `useShellLang`, `ShellLangContext`.
- `types.ts`: all prop types above.

## Routes this module links to (owned elsewhere)

`POST /sign-out` (auth) · `GET /api/v1/notifications/summary` (notifications) · `/sign-in`, `/sign-up` ·
`/employers/request` · `/account`, `/account/security`, `/account/notifications`, `/account/privacy` ·
`/<portal>/support` · the three verification pages above · legal pages `/privacy`, `/terms`,
`/cookie-preferences`, `/data-rights`, `/accessibility`, `/grievance-redressal` · all `NAVIGATION` hrefs.

## Shared words for People Portal pages (`common` namespace)

`action.*` (save, saveChanges, cancel, edit, delete, remove, add, back, next, previous, continue, submit, search,
filters, applyFilters, clearFilters, clear, close, confirm, view, viewAll, viewDetails, download, upload, update,
retry, done, showMore, showLess, getStarted, learnMore, share, copy) · `state.*` (loading, saving, saved,
submitting, noResults, empty) · `field.required`, `field.optional` · `error.*` (generic, fixFields, network) ·
`common.*` (yes, no, all, none, or, status, date, details, actions, new, results_one/_other) · `pagination.*` ·
`nav.*`, `portal.*`, `shell.*` (incl. `shell.language`, `shell.changeLanguage` for the language switcher), `setup.*`.
Hindi and Telugu carry the same keys and placeholders (a test enforces it).

## Accessibility

Landmarks (`banner`, `navigation` with labels, `main#main-content` focusable for the skip link,
`contentinfo`), `aria-current` on active links, Radix menus/sheets/popovers for keyboard support and focus
return, 40–44 px icon targets, visible focus (global outline, inset inside scrolling lists so it is never
clipped and stays visible in forced-colours mode), status conveyed by text and icon (never colour alone),
`prefers-reduced-motion` respected, no horizontal scroll at 360 px (tabs and long lists scroll in their own row).

## Browser storage

Cookies `vsg_sidebar` (collapsed/expanded) and `vsg_last_portal` (account back link) — preferences only,
`SameSite=Lax`. Announcement dismissal: `localStorage["vsg:announcement-dismissed:<id>"]`. All access is
wrapped in try/catch; the UI works without storage.

## Tests

`npx vitest run src/components/layout src/components/brand` — navigation matching/filtering, breadcrumb trails,
translation catalogue parity (en/hi/te keys and placeholders), status copy, notification payload parsing, link
sanitising, priority+ fitting, relative time. `shell-data.test.ts` runs against an isolated database
(`node scripts/test-db.mjs vsg_test_designshell`, then set `DATABASE_URL`) and is skipped otherwise.
