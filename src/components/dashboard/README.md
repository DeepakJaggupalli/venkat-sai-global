# Dashboard kit (`src/components/dashboard`)

Building blocks for every portal's home dashboard and for portal help: a greeting header, real-number tiles,
big action cards, a "How to use" card, a set-up checklist, recent items, small charts and calm empty states.
Designed to `DESIGN.md` (white cards, hairline border, 18–22px radius, one aqua accent, black pills, Figtree 800
headings) and `docs/WEB_INTERFACE_GUIDELINES.md`. Phone first: 390px with 44px touch targets, no sideways scroll.

**Rules.** Show only real numbers from the database (never sample or "marketing" figures); give empty lists an
honest empty state with a next step; filter actions by permission before passing them; money is a preformatted
string that already carries its currency (use `MoneyText`/`formatMoney` upstream, never assume INR).

**Server vs client.** Everything is a server component except `ChartCard` (recharts) and the inner
`HowToUseCard`. Icons are lucide components (`icon: Briefcase`), so pass them from server pages only.

**Imports.** `import { DashboardHeader, StatGrid, StatTile, QuickActions, HowToUse, GettingStarted, RecentList,
SectionCard, EmptyState, PillLink } from "@/components/dashboard";` and
`import { ChartCard } from "@/components/dashboard/chart-card";` (not in the barrel: it pulls in recharts).
`SectionCard` / `EmptyState` here are the dashboard-styled versions; data pages keep using `@/components/shared/*`.

**Motion.** CSS only (`dashboard-motion.css`, loaded by `motion.ts`): the header rises in, tiles and action cards
rise in with a small stagger, whole numbers below 1,000 count up from zero on first paint (a CSS counter on a
registered `@property`; the real value is in the server HTML for screen readers). Everything stops for
`prefers-reduced-motion`. This project loads every `.css` file as plain CSS (see `next.config.ts`), so CSS Modules do
not work: global classes are prefixed `vsg-`.

## Components

### `DashboardHeader` (server)
Owns the page `<h1>`: "Good morning, Ravi" by the clock in Asia/Kolkata, subtitle, today's date, up to 3 pills.

| Prop | Type | Notes |
|---|---|---|
| `name` | `string \| null` | display name; first word only, never an email/phone |
| `title` | `ReactNode` | replaces the greeting (rare) |
| `subtitle` | `ReactNode` | "Operations Manager · Venkat Sai Global" |
| `eyebrow` | `ReactNode` | small accent label above |
| `actions` | `DashboardAction[]` | max 3; first black, rest white; `{ label, href, icon?, variant?: "primary" \| "secondary", external? }` |
| `children` | `ReactNode` | extra row (badges, notices) |
| `now`, `timeZone` | `Date`, `string` | default now / `"Asia/Kolkata"` |

### `StatTile` + `StatGrid` (server)
`StatGrid({ children, columns?: 2 | 3 | 4 = 4, label?, className? })`: 2 per row on phones, `columns` from `lg`.

| `StatTile` prop | Type | Notes |
|---|---|---|
| `label` | `string` | "CVs to call back" |
| `value` | `number \| string \| null` | number counts up; string shown as is (money with currency); null → "—" |
| `href` | `string \| null` | whole tile is the link |
| `hint` | `ReactNode` | "3 new today" |
| `tone` | `"default" \| "attention" \| "positive"` | attention adds a "Needs action" pill only while value > 0 |
| `icon` | `LucideIcon` | |
| `unit`, `attentionLabel`, `className` | | |

### `QuickActions` (server)
`QuickActions({ items, title?, description?, columns?: 3 | 4 = 4, headingLevel?, className? })` — renders nothing
when `items` is empty. 2 columns on phones, 3 on tablets, `columns` from `xl`.
Item: `{ label, href, icon: LucideIcon, hint?, badge?: number | null, badgeLabel? = "new", external? }`.

### `HowToUse` (server wrapper + client card)
`HowToUse({ portal, permissions?, steps?, guideHref?, title? = "How to use", description? })`.
Reads `quickSteps` of `portal` from `src/config/portal-guides.ts`, drops steps the `permissions` (array or Set)
cannot use, links "Open the full guide" to the portal help page. Expanded on a first visit; "Hide" / "Show how to
use" is remembered per portal in `localStorage["vsg:how-to-use:<portal>"]` (try/catch; works without storage).
For the employer workspace pass `portal={portalForEmployerKind(kind)}` ("employer" or "agency").

### `GettingStarted` (server)
`GettingStarted({ items, title? = "Getting started", description?, headingLevel?, className? })`.
Item: `{ id, label, description?, done, href }` (`done` computed by the caller from real data). Progress bar
(`<progress>`), "Next step" on the first open item; renders nothing once every item is done.

### `RecentList` (server)
`RecentList({ title, description?, items, empty, viewAll?, icon?, limit? = 6, headingLevel?, now?, className? })`.
Item: `{ id, title, meta?, href?, at?: Date | string, status?: { value?, domain?, label?, tone? } }` (status goes
through the shared `StatusBadge` presets). `empty: { title, description?, action?: DashboardAction, icon? }`.
Relative time ("2 hours ago") with the exact time in India time as the tooltip.

### `ChartCard` (client)
`ChartCard({ title, description?, data, type?: "bar" | "line" = "bar", unit?, summary?, link?, emptyTitle?,
emptyDescription?, headingLevel?, className? })`. `data: { label: string; value: number }[]`, oldest first.
One accent colour, quiet axes, tooltip, an sr-only summary ("6 points, total 42 … Highest: 12 in 16 Nov") and an
empty state when every value is zero. Built on `src/components/ui/chart.tsx`.

### `SectionCard` (server)
`SectionCard({ title?, description?, action?: { label, href } | ReactNode, icon?: LucideIcon, headingLevel?,
flush?, id?, children, className?, contentClassName? })` — a labelled `<section>` card. `SectionLink({ link })` is
the "View all →" link with a 44px target.

### `EmptyState` (server)
`EmptyState({ title, description?, icon?: LucideIcon, action?: DashboardAction, secondaryAction?, size?: "sm" |
"md", className? })`.

### `PillLink` (server)
`PillLink({ action: DashboardAction, className?, arrow? = true })` — the DESIGN.md black / white pill link.

### Helpers (pure)
`greetingFor(name, now?, timeZone?)`, `timeOfDay`, `firstNameOf`, `formatDashboardDate`, `isoDateIn`
(`greeting.ts`); `checklistProgress`, `nextChecklistItem` (`checklist.ts`); `readHowToUseState`,
`writeHowToUseState` (`how-to-use-storage.ts`); `summarizeChart`, `isEmptyChart` (`chart-summary.ts`);
`canCountUp` (`count-up.tsx`); `isAttentionValue` (`stat-tile.tsx`).

## Example

```tsx
export default async function Dashboard() {
  const staff = await requireStaff();
  const counts = await getMyCounts(staff);              // real numbers only
  return (
    <div className="space-y-6">
      <DashboardHeader name={staff.user.displayName} subtitle="Owner · Venkat Sai Global"
        actions={[{ label: "Post requirement", href: "/admin/requirements/posters/new", icon: Megaphone }]} />
      <StatGrid label="Today">
        <StatTile label="CVs to call back" value={counts.newCvs} tone="attention" icon={FileUser} href="/admin/cv-submissions" />
      </StatGrid>
      <HowToUse portal="admin" permissions={staff.permissions} />
      <QuickActions title="Quick actions" items={actions.filter((a) => staffCan(staff, a.permission))} />
    </div>
  );
}
```

## Related

- Guide registry: `src/config/portal-guides.ts` (`PORTAL_GUIDES`, `guideFor`, `PORTAL_HELP_HREF`); help pages use
  `PortalHelpPage` from `src/components/help/portal-help-page.tsx`.
- Error screens: `RouteError` (`src/components/shared/route-error.tsx`) and `NotFoundView`
  (`src/components/shared/not-found-view.tsx`).

## Tests

`npx vitest run src/components/dashboard src/config/portal-guides.test.ts src/components/shared/route-error.test.tsx`
