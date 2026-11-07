# Taxonomy typeahead API (`/api/v1/taxonomy`)

Public, read-only reference endpoints used by typeahead controls (e.g. `SkillPicker`). No authentication (the data is
public reference data), every parameter is validated with zod, responses are small and cached privately for 60 s.

| Endpoint | Query | Response |
|---|---|---|
| `GET /api/v1/taxonomy/skills` | `q` (≤ 80 chars; empty → no items), `category?` (`technical`, `software`, `industrial`, `trade`, `language`, `soft`), `limit?` (1–25, default 15) | `{ items: { id, name, category, slug }[] }` — approved + active skills, matched on name and synonyms, trigram-ranked (`searchSkills` from `@/modules/taxonomy/queries`) |
| `GET /api/v1/taxonomy/job-categories` | `q?` (≤ 80 chars), `limit?` (1–50, default 20) | `{ items: { id, name, slug, parentId }[] }` — active categories, case-insensitive substring match (wildcards escaped), prefix matches first; empty `q` lists categories in admin order |

Errors: `400 { error }` for invalid parameters, `500 { error }` (logged) when the database fails. Error responses are
`Cache-Control: no-store`.

## Files

- `skills/route.ts`, `job-categories/route.ts` — handlers.
- `_lib/params.ts` — zod schemas (`skillSearchSchema`, `jobCategorySearchSchema`), `pickParams`, `escapeLike`, `firstIssue` (unit-tested).
- `_lib/queries.ts` — `searchJobCategories(q, limit)` (local read-only query; the taxonomy module has no category search yet).
- `_lib/respond.ts` — `jsonItems`, `jsonError` (cache headers).
- `routes.integration.test.ts` — runs against an isolated database only:
  `node scripts/test-db.mjs vsg_test_design` then `$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_design'; npx vitest run src/app/api/v1/taxonomy`.
