# Shared components (`src/components/shared`)

Cross-portal building blocks of the Venkat Sai Global design system, built on the shadcn primitives in
`src/components/ui` (style `radix-nova`) and the tokens in `src/app/globals.css`. Every portal uses these
instead of re-styling primitives page by page.

**Principles**

- Calm, premium, enterprise: white cards on `bg-surface-subtle`, `rounded-xl`, hairline borders, navy headings
  (`font-heading`), Inter body. Teal and gold are fills; text uses `text-teal-strong` / `text-gold-strong`.
- WCAG 2.2 AA: labelled controls, visible focus, colour never the only signal, keyboard operable, 24px+ targets.
  Tone text colours are AA-checked (see `tones.ts` — `text-success`/`text-warning` alone fail on white, so tones
  derive darker text with `color-mix()`).
- Mobile first: no horizontal page scroll at 360px; tables become cards; long strips scroll inside themselves.
- Honest data: components only display what they are given. No default numbers, no placeholder people.
  Empty lists show an `EmptyState`; missing values show "—" or "Not provided".
- No inline-style dependencies for layout (CSP-friendly): sizes come from classes and SVG attributes.

**Server vs client.** Files without `"use client"` are server-component friendly (they also work inside client
components). Client components accept serialisable props from server pages; props that are functions
(`renderCard`, `onMove`, `valueFormatter`, column `cell` renderers of `SelectableDataTable`…) must be passed
from a client component — or be a **Server Action** (e.g. `onConfirm={archiveJob.bind(null, { id })}`).

**Imports.** Import from the file, e.g. `import { PageHeader } from "@/components/shared/page-header"`.
Folders with an `index.ts` (`data-table`, `filters`, `form`, `charts`) can also be imported as a folder.

**QA page.** `/dev/ui` (development only, 404 in production) renders every component with sample data.

---

## Layout & content

### `PageHeader` — `page-header.tsx`
Title block for every page.

| Prop | Type | Notes |
|---|---|---|
| `title` | `ReactNode` | required |
| `description` | `ReactNode` | |
| `breadcrumbs` | `{ label; href? }[]` | last entry = current page; phones show parent + current only |
| `backLink` | `{ href; label }` | "← Back to jobs" above the title |
| `status` | `ReactNode` | e.g. `<StatusBadge …/>` next to the title |
| `eyebrow` | `ReactNode` | small line above the title (record code) |
| `meta` | `ReactNode` | row under the description |
| `actions` | `ActionSlot \| ActionSlot[]` | `{ label, href, icon?, variant?, external? }` or any element; first link action is primary |
| `as` | `"h1" \| "h2"` | default `h1` |

```tsx
<PageHeader title="Jobs" description="Create, publish and track postings."
  breadcrumbs={[{ label: "Employer", href: "/employer" }, { label: "Jobs" }]}
  actions={[{ label: "Post a job", href: "/employer/jobs/new" }]} />
```
`PageBreadcrumbs({ items })` is exported for custom headers. `ActionLink` / `renderActionSlot` (`action-link.tsx`) render link actions as buttons.

### `SectionCard` — `section-card.tsx`
`<section>` card labelled by its title. Props: `title`, `description`, `action` (ActionSlot), `icon`, `footer`,
`headingLevel` (`h2`|`h3`), `flush` (no body padding — tables/lists edge to edge), `id`, `className`, `contentClassName`.
```tsx
<SectionCard title="Documents" action={{ label: "Upload", href: "/talent/documents/new" }}><FileList files={files} /></SectionCard>
```

### `KeyValueList` — `key-value-list.tsx`
Semantic `<dl>`. Props: `items: { label; value; hint?; fullWidth?; key? }[]`, `columns` (1|2|3), `layout`
(`stacked`|`inline`), `emptyText` (default "Not provided"), `dense`.

### `Callout` / `Notice` — `callout.tsx`
Props: `tone` (`info`|`success`|`warning`|`danger`|`neutral`|`brand`), `title`, `children`, `icon` (or `null`),
`action` (ActionSlot), `live` (`"polite"`|`"assertive"` — only for messages that appear dynamically; static notices
never interrupt screen readers). Screen readers hear "Warning:/Error:/Success:" prefixes.

### `EmptyState` — `empty-state.tsx`
Props: `title`, `description`, `icon` (lucide element, default inbox, `null` hides), `primaryAction`, `secondaryAction`
(ActionSlot), `variant` (`dashed`|`plain`), `size` (`sm`|`md`), `titleAs` (`p` default, `h2`, `h3`).

### Loading presets — `loading-state.tsx`
`LoadingState({ variant: "page" | "table" | "cards" | "detail", label? })` for `loading.tsx`, plus `PageSkeleton`,
`TableSkeleton({ rows, columns })`, `CardsSkeleton({ count })`, `DetailSkeleton`, `StatGridSkeleton`,
`PageHeaderSkeleton`, `Bone`. Each announces one polite "Loading…".
```tsx
export default function Loading() { return <LoadingState variant="table" />; }
```

### `StatCard` + `StatGrid` — `stat-card.tsx`
KPI tile. **Values come from props only** (live counts or admin-approved figures).

| Prop | Type | Notes |
|---|---|---|
| `label` | `string` | sentence case, no colon |
| `value` | `number \| string \| null` | `null` renders "—" ("Not available" for SR) |
| `unit` | `string` | e.g. "days" |
| `compact` | `boolean \| "auto"` | auto: compact from 10,000 |
| `delta` | `{ value; format?: "percent"\|"number"\|"points"; period?; goodDirection?: "up"\|"down"\|"neutral" }` | percent takes a ratio (0.12 = +12%); colour = direction × good direction; arrow + spoken sentence |
| `hint`, `icon`, `href`, `asOf`, `locale` | | `asOf` prints "As of …" (public metrics must carry one) |

`StatGrid({ columns: 2 | 3 | 4 })` — one column on phones. Helpers in `stat-utils.ts`: `formatStatValue`,
`formatDelta`, `describeDelta`, `deltaDirection`, `deltaTone`.

### `StatusBadge` — `status-badge.tsx`
Props: `status`, `domain` (`verification`|`organization`|`job`|`application`|`applicationStage`|`payment`|`invoice`|`ticket`|`approval`|`generic`),
`tone` (force), `overrides` (audience wording, e.g. candidate-facing), `children` (custom label), `dot`, `icon`,
`size` (`sm`|`md`), `srPrefix`.
```tsx
<StatusBadge status={job.status} domain="job" />
<StatusBadge status="pending_staff" domain="ticket" />   // "Awaiting support"
<StatusBadge tone="gold">Featured</StatusBadge>
```
Presets and `resolveStatus(status, domain, overrides)` live in `status-presets.ts`; unknown values fall back to a
neutral, humanised label. Tones: `neutral`, `info`, `success`, `warning`, `danger`, `brand`, `gold` (`tones.ts`, `TONE_STYLES`).

### `VerificationBadge` — `verification-badge.tsx`
Distinguishes **verified**, **employer-supplied**, **self-declared**, **pending review** and **unverified** information
(spec 8.4). Props: `state` (a state or raw value such as `job.infoSource` / `doc.verificationStatus`), `verifiedAt`,
`label`, `description`, `variant` (`badge` with hover tooltip | `inline` | `detail` with visible explanation), `timeZone`.
The explanation is always available to screen readers. `toVerificationState()` (`verification.ts`) never maps
unconfirmed values to "verified".

### `Timeline` — `timeline.tsx`
Props: `items: { id; title; at; actor?: { name; role? }; note?; icon?; tone? }[]`, `timeFormat` (`relative`|`absolute`),
`timeZone`, `label`, `emptyTitle`, `emptyDescription`. Never pass internal notes to candidate-facing timelines.

### `Stepper` — `stepper.tsx`
Props: `steps: { id; label; description?; href? }[]`, `current` (id or index), `completed?` (ids), `orientation`
(`horizontal` collapses to "Step 2 of 5" + bar on phones | `vertical`), `label`. Completed/current steps with `href`
become links. `resolveStepStates()` is exported.

### `FileList` — `file-list.tsx`
Props: `files: { id; name; size?; mimeType?; href?; uploadedAt?; description?; status?; actions? }[]`, `label`,
`emptyTitle`, `emptyDescription`, `timeZone`. Type icon, "PDF · 240 KB", download link. `fileKind()` exported.
Use files-module URLs for `href` (private files go through the authorised route).

### `DescriptionWithReadMore` — `description-read-more.tsx` (client)
Props: `html` (sanitised, rendered with `SafeHtml`) or `children` (plain text), `lines` (3|4|6|8), `labels`.
The toggle only appears when content overflows; full text stays in the DOM.

### `SafeHtml` — `safe-html.tsx`
`<SafeHtml html={sanitisedHtml} />` renders HTML sanitised on write with `sanitizeRichText()`. `RICH_TEXT_CLASSES`
is the shared typography (also used by the editor).

### `ProgressRing` / `CompletenessMeter` — `progress-ring.tsx`
`ProgressRing({ value 0–100, label, size: "sm"|"md"|"lg", tone: "brand"|"success"|"warning"|"danger", showValue })` —
`role="progressbar"`, same-ramp track.
`CompletenessMeter({ title, description, items: { id; label; done; href?; hint? }[], value?, maxOutstanding, completeText })` —
percentage from items unless `value` (e.g. stored `profileCompleteness`) is given; lists next steps as links.

### Formatting — `money-text.tsx`, `date-text.tsx`, `relative-time.tsx`
- `MoneyText({ amountMinor, currency, locale?, fallback?, tabular? })` — minor units + the record's currency. Never assume INR.
- `SalaryRangeText({ minMinor, maxMinor, currency, period?, fallback = "Not disclosed" })`.
- `DateText({ value, mode: "date"|"datetime", timeZone?, dateOnly?, locale? })` — `<time>`; pass the viewer's zone
  (`user.timezone ?? env().DEFAULT_TIMEZONE`); `dateOnly` for calendar dates stored as UTC midnight.
- `RelativeTime({ value, timeZone?, refreshMs = 60000 })` (client) — "3 hours ago", exact time in `title`.

### Avatars — `avatars.tsx`
`UserAvatar({ name, src?, size: "xs"|"sm"|"md"|"lg"|"xl", labelled? })` and `OrgAvatar({ …, verified? })` with
initials fallback and deterministic soft colour (`avatar-utils.ts`). Decorative by default (next to a visible name);
`labelled` announces the name. Only pass `verified` for organisations verified by Venkat Sai.

---

## Navigation & tables

### `LinkTabs` — `link-tabs.tsx` (client)
URL tabs: real links with `aria-current="page"`. Props: `items: { href; label; count?; icon?; match?: "exact"|"prefix" }[]`,
`label` (nav name), `activeHref?` (override). Sibling tabs are told apart by their query keys
(`/apps` vs `/apps?status=active`).

### `Pagination` — `pagination.tsx`
Link-based (works without JS), built on `withParams` so filters/sorting survive.
Props: `page`, `pageCount`, `pathname`, `searchParams` (awaited page params), `total?`, `pageSize?` (enables
"Showing 21–40 of 132"), `itemLabel`, `param = "page"`, `label`, `labels`.
```tsx
const sp = await searchParams; const q = parsePage(sp);
<Pagination pathname="/employer/jobs" searchParams={sp} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} itemLabel="jobs" />
```
`pageWindow()` / `pageRange()` in `pagination-utils.ts`.

### `DataTable` — `data-table/data-table.tsx`
Server-component friendly generic table. Define columns **where the table renders** (cell renderers are functions).

| Prop | Type | Notes |
|---|---|---|
| `columns` | `DataTableColumn<T>[]` | `{ id, header, cell(row, i), align?, hideOnMobile?, hideOnDesktop?, primary?, mobileLabel?, sortKey?, className?, headerClassName?, nowrap? }` |
| `rows`, `getRowId` | | |
| `rowLink` | `(row) => { href; label } \| null` | whole row/card becomes a link (label for screen readers); buttons/links inside cells stay clickable |
| `rowHref` + `rowLabel` | | shorthand for `rowLink` |
| `caption` | `string` | required (sr-only unless `captionVisible`) |
| `sort` | `{ by, dir, pathname, searchParams, param?, dirParam? }` | header links toggle `?sort=&dir=` and reset the page; `aria-sort` set |
| `empty` | `ReactNode` | default neutral empty state |
| `mobile` | `"cards" \| "scroll"` | cards below `stackBelow` (`sm`|`md`|`lg`, default `md`) |
| `bordered`, `toolbar`, `footer`, `className` | | `footer` is the place for `<Pagination/>` |

```tsx
const sort = parseSort(sp, ["createdAt", "title"] as const, { by: "createdAt", dir: "desc" }); // whitelist before querying
<DataTable caption="Job postings" rows={jobs} getRowId={(j) => j.id}
  rowLink={(j) => ({ href: `/employer/jobs/${j.id}`, label: `Open ${j.title}` })}
  sort={{ by: sort.by, dir: sort.dir, pathname: "/employer/jobs", searchParams: sp }}
  columns={[
    { id: "title", header: "Job", primary: true, sortKey: true, cell: (j) => j.title },
    { id: "status", header: "Status", cell: (j) => <StatusBadge status={j.status} domain="job" size="sm" /> },
    { id: "applications", header: "Applications", align: "right", cell: (j) => j.applicationCount },
  ]}
  empty={<EmptyState title="No jobs yet" description="Jobs you post will appear here." />} />
```
Helpers (`data-table/utils.ts`): `parseSort`, `sortHref`, `nextSortDirection`, `desktopColumns`, `mobileCardColumns`.

### `SelectableDataTable` — `data-table/selectable-data-table.tsx` (client)
`DataTable` + row checkboxes + bulk action bar. Extra props: `bulkActions: { id; label; icon?; variant?: "default"|"outline"|"destructive"; onAction(ids); confirm?: { title; description?; confirmLabel? }; successMessage? }[]`,
`selectLabel(row)` (checkbox name), `isRowSelectable?`, `onSelectionChange?`, `labels?`. `onAction` may be a Server
Action; return an ActionResult (or `false`) to report failure. Selection is per page.

---

## Filters (client, URL-synced) — `filters/`

All controls read/write search params with `router.replace(…, { scroll: false })`, reset `page` on change, and read
the live URL so debounced updates never undo another control. All routes here are dynamic; if you use these in a
prerendered route, wrap them in `<Suspense>` (they call `useSearchParams`). **Validate every param on the server.**

- `FilterBar({ search?, children, paramKeys, actions?, label?, labels? })` — one row above the content: search,
  filters (collapsed behind "Filters (n)" on phones), "Reset filters", pending spinner.
- `SearchInput({ param = "q", label, placeholder?, debounceMs = 350, minLength?, maxLength?, showLabel? })` —
  `role="search"`; Enter searches now, Escape clears.
- `FilterSelect({ param, label, options, allLabel, showLabel? })` — single value; "All" removes the param.
- `DateRangeFilter({ label, fromParam = "from", toParam = "to", presets?, emptyLabel?, allowCustom? })` — presets
  (today, 7/30/90 days, month/year to date) + custom range with native date inputs. Values are ISO dates (inclusive).
- `FilterChips({ filters: { param; label; options?; kind?: "date"; format? }[], clearLabel? })` — removable chips.
- `FilterScope` + `FilterPendingRegion` — share one transition so results dim while reloading (no skeleton flash).
- `useUrlFilters()` — `{ searchParams, get, getAll, setParam, setParams, reset, isPending }` for custom controls.

```tsx
<FilterScope>
  <FilterBar paramKeys={["q", "status", "from", "to"]} search={<SearchInput label="Search jobs" />}>
    <FilterSelect param="status" label="Status" allLabel="All statuses" options={statusOptions} />
    <DateRangeFilter label="Posted" />
  </FilterBar>
  <FilterChips filters={[{ param: "status", label: "Status", options: statusOptions }, { param: "from", label: "From", kind: "date" }]} />
  <FilterPendingRegion><DataTable … /></FilterPendingRegion>
</FilterScope>
```

---

## Forms (client) — `form/`

Designed for `ActionResult` from `src/lib/actions.ts` (`useActionState(action, null)`).

### `FormField`
Props: `label`, `name`, `id?`, `required` (asterisk + `required`/`aria-required`), `optional` ("(optional)"), `hint`,
`errors?` or `state` (reads `state.fieldErrors[name]`, also `name[]`), `hideLabel`, `labels`. Child: one element
(props merged: `id`, `name`, `required`, `aria-invalid`, `aria-describedby`) **or** a render function receiving
`FieldControlProps` for custom controls. The label has id `${id}-label` (used by non-labelable controls such as the
rich text editor). Forms may add `noValidate` to rely on server errors only.
```tsx
<FormField label="Job title" name="title" required state={state} hint="Shown to candidates"><Input /></FormField>
<FormField label="Country" name="countryCode" state={state}>{(field) => <CountrySelect {...field} options={countries} />}</FormField>
```

### `FormErrorAlert`
`<FormErrorAlert state={state} fieldLabels={{ title: "Job title" }} />` — announces the form error, takes focus after a
failed submit, and (with `fieldLabels` or `showSummary`) lists each invalid field with a button that focuses it.
Props: `title`, `focusOnError` (default true). `focusField(fromEl, name)` is exported.

### `SubmitButton`
`<SubmitButton pendingLabel="Saving…">Save</SubmitButton>` — pending from `useFormStatus()` (or `pending` prop for
buttons outside the form). Stays focusable while pending (`aria-disabled`), ignores repeat clicks, announces "Submitting".

### `useActionToast(state, { errorToast?, successMessage?, onSuccess?, onError? })`
Toasts `state.message` once per submission (sonner). Errors stay inline unless `errorToast`.

Helpers (`form/action-result.ts`): `fieldErrorsFor`, `formErrorOf`, `listFieldErrors`, `interpretOutcome`,
`isActionResult`, `isNavigationError`.

---

## Inputs (client)

### Selects — `selects.tsx`
Options always come from the server (`countryOptions()`, `currencyOptions()`, enum labels). Each renders a hidden
input with `name`, and accepts FormField wiring (`id`, `aria-*`, `required`).
- `SimpleSelect({ name, options, value?, defaultValue?, onValueChange?, placeholder?, allowClear?, clearLabel?, disabled? })` — short lists.
- `SearchableSelect({ …, searchPlaceholder?, emptyText? })` — long lists, matches label/value/keywords.
- `CountrySelect`, `CurrencySelect`, `LanguageSelect` — `SearchableSelect` presets (search by code too). Never default a currency silently.

### `TagInput` — `tag-input.tsx`
Free-text tags (`name[]` hidden inputs → `f.stringArray()`). Props: `name`, `value?`/`defaultValue?`/`onChange?`,
`placeholder`, `maxTags = 20`, `maxLength = 40`, `lowercase`, `disabled`. Enter/comma add, Backspace removes,
paste a list. `addTags()` in `tag-utils.ts`.

### `MultiCombobox` — `multi-combobox.tsx`
Searchable multi-select with chips. Props: `name` (`name[]`), `options` (static) **or** `loadOptions(query, signal)`
(async, debounced, aborts stale requests), `value?`/`defaultValue?: SelectOption[]`, `onChange?`, `placeholder`,
`searchPlaceholder`, `emptyText`, `typeToSearchText`, `maxSelected`, `minQueryLength`, `debounceMs`, `renderOption?`.
Checked state uses `aria-checked`; selections are announced.

### `SkillPicker` — `skill-picker.tsx`
`MultiCombobox` backed by `GET /api/v1/taxonomy/skills`. Props: all MultiCombobox props except options/loader, plus
`category?` (`SkillCategory`) and `limit` (≤ 25). Shows each skill's category. Pass labelled `defaultValue` for
existing selections (e.g. from `getSkillsByIds()`). `fetchSkillOptions()` is exported.

### `RichTextEditor` — `rich-text/rich-text-editor.tsx`
Tiptap v3 (starter kit + link + placeholder). Toolbar: bold, italic, H2, H3, bullets, numbers, quote, link, undo,
redo — a WAI-ARIA toolbar (one tab stop, arrow keys, `aria-pressed`). Props: `name` (hidden input with HTML),
`defaultValue`, `onChange`, `placeholder`, `maxLength` (soft plain-text limit + counter), `minHeight`, `disabled`,
`toolbarLabel`, FormField wiring. Links accept only http(s)/mailto/tel. **Always sanitise on the server:**
`sanitizeRichText(input.descriptionHtml)`; render with `SafeHtml`.

### `MaskedValue` — `masked-value.tsx`
`<MaskedValue masked={maskEmail(c.email)} label="email address" kind="email" onReveal={revealEmail.bind(null, { candidateId })} />`
Props: `masked`, `label`, `onReveal` (Server Action that authorises, calls `logDataAccess()` and returns
`ActionResult<{ value }>` or a string), `kind` (`text`|`email`|`phone`), `notice` (default "Revealing is recorded in the
access log."), `allowCopy`. The real value is never sent until revealed; "Hide" clears it.

### `CopyButton` — `copy-button.tsx`
`<CopyButton value={code} label="verification code" />` — props `showLabel`, `size`, `variant`, `onCopied`. Visible +
announced confirmation; legacy fallback for insecure contexts.

---

## Overlays (client)

### `ConfirmDialog` — `confirm-dialog.tsx`
Props: `trigger` (element) or controlled `open`/`onOpenChange`, `title`, `description`, `children` (extra fields — their
values reach `onConfirm(formData)`), `confirmLabel`, `cancelLabel`, `pendingLabel`, `variant` (`default`|`destructive`),
`onConfirm` (async callback or Server Action; return an ActionResult or `false` to keep the dialog open with the error),
`successMessage` (toast fallback, `false` = none), `onSuccess`. Cannot be dismissed mid-request.
```tsx
<ConfirmDialog trigger={<Button variant="outline">Close job</Button>} title="Close this job?"
  description="Candidates will no longer be able to apply." confirmLabel="Close job"
  onConfirm={closeJob.bind(null, { id: job.id })} />
```

### `ResponsiveDialog` — `responsive-dialog.tsx`
Dialog on desktop, bottom sheet on phones. Props: `open?`, `onOpenChange?`, `trigger?`, `title`, `description?`,
`children`, `footer?`, `size` (`sm`|`md`|`lg`).

---

## Boards & charts (client)

### `KanbanBoard` — `kanban/kanban-board.tsx`
Generic board (`@dnd-kit/core` + `sortable`): mouse, touch and keyboard dragging with screen-reader announcements, plus
a **"Move to" menu on every card** (single-pointer alternative, WCAG 2.5.7; main path on phones).

| Prop | Type | Notes |
|---|---|---|
| `columns` | `{ id; title; description?; tone? }[]` | header shows the count |
| `items` | `T extends { id; columnId }` | order within a column = array order; new `items` from the server replace local state |
| `renderCard(item)` | `ReactNode` | card body |
| `getItemLabel(item)` | `string` | used in announcements/menus |
| `onMove(move, item)` | `{ itemId, fromColumnId, toColumnId, toIndex }` | optimistic; return an ActionResult or `false` to roll back (error toast) |
| `canMove?(item, toColumnId)` | `boolean` | UI hint; enforce rules on the server |
| `label`, `emptyColumnText`, `successMessage` | | |

Pure helpers: `moveItem`, `columnItems`, `indexInColumn`, `isNoopMove`, `countByColumn` (`kanban/kanban-utils.ts`).

### Charts — `charts/`
`LineChart`, `AreaChart`, `BarChart`, `DonutChart` over the shadcn chart container + recharts, following the data-viz
method: validated brand palette (`charts/palette.ts` documents the validator results), 2px lines, ≤ 24px bars with a
rounded data end, ~10% area wash, hairline solid grid, one y axis, compact ticks from 10K, legend for ≥ 2 series (none
for one), tooltip that lists every series (value first, key in the series colour, text never coloured), keyboard
access via the recharts accessibility layer, and a **"View data table" twin** (always available to screen readers).

Common props (`CartesianChartProps`): `data` (rows), `index` (x key), `indexLabel`, `series: { key; label; color? }[]`
(keep order stable — colour follows position), `title` (accessible name), `description`, `showTitle`, `size`
(`sm` 200px | `md` 260px | `lg` 340px), `xFormat` (`text`|`date`|`month` for ISO dates), `numberFormat`
(`Intl.NumberFormatOptions`, serialisable), `valueFormatter`/`xFormatter` (client only), `emptyText`.
- `LineChart` + `showDots`. `AreaChart` + `stacked`. `BarChart` + `orientation` (`vertical`|`horizontal`), `stacked`.
- `DonutChart({ data: { label; value; color? }[], title, centerLabel?, categoryLabel?, numberFormat?, maxSegments ≤ 6, otherLabel? })` —
  ≤ 6 segments (tail folds into "Other"); the legend lists value and share. Prefer a horizontal `BarChart` to compare parts.
```tsx
<SectionCard title="Applications per week">
  <LineChart title="Applications per week" index="week" indexLabel="Week" xFormat="date" data={rows}
    series={[{ key: "applications", label: "Applications" }]} />
</SectionCard>
```
Never plot invented numbers; when there is no data the chart shows its empty state.

---

## Utilities

- `tones.ts` — `TONES`, `TONE_STYLES` (`soft`, `text`, `dot`, `border`, `surface`), `isTone`.
- `types.ts` — `SelectOption`, `LinkAction`, `ActionSlot`, `isLinkAction`.
- `url-state.ts` — `patchSearchParams`, `buildHref`, `toURLSearchParams`, `countActiveParams`, `toggleValue`,
  `isHrefActive`, `distinguishingKeys`.
- Pure helpers are unit-tested next to their files (`*.test.ts`); `render.test.tsx` / `client-render.test.tsx`
  server-render every component as a smoke test.

## Not in this folder

- `FileUpload` (posts to `/api/v1/uploads`) is provided by the files module.
- Portal shells, headers and navigation live in `src/components/layout`.
