# Command Centre components (`src/components/admin`)

Shared building blocks for Command Centre pages (owner: ui:admin-ops). Other admin teams may import them.

| File | Kind | Purpose |
|---|---|---|
| `action-form.tsx` | client | `ActionForm` — declarative form for a `createFormAction` Server Action: serialisable field specs (`text`, `textarea`, `richtext`, `select`, `search-select`, `multi`, `date`, `datetime-local` (submitted as ISO in the viewer's zone), `number`, `email`, `tel`, `checkbox`), hidden fields, inline errors, form alert, toast, refresh or `successHref` (`{id}` → `data.id`). |
| `action-button.tsx` | client | `ActionButton` — one-click bound Server Action (`action.bind(null, input)`), optional `confirm`. |
| `assign-select.tsx` | client | `AssignSelect` — staff picker that saves on change through an `({ id, assigneeUserId })` action. |
| `internal-notes.tsx` | server | `InternalNotesPanel` — staff-only notes on any `NOTE_ENTITY_TYPES` record (operations module). |
| `priority-badge.tsx` | server | `PriorityBadge`, `PRIORITY_OPTIONS` (low / normal / high / urgent). |
| `sparkline.tsx` | server | `Sparkline` — single-series inline SVG trend for stat tiles, with a screen-reader summary. |
| `route-error.tsx` | client | `AdminRouteError` — body for `error.tsx` boundaries. |
| `queries.ts` | server-only | `listStaffOptions({ permission? })`, `userNames(ids)`, `listOrganizationOptions(type?)`. |
| `dashboard-queries.ts` | server-only | Live counts, weekly trends, per-currency revenue / outstanding, live subscriptions for `/admin`. |

Callers must authorise (`requireStaff(permission)`) before using the server helpers; the forms' actions
re-authorise on the server.
