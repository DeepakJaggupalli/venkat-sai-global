# Taxonomy module (`src/modules/taxonomy`)

Reference data: countries, states, languages, currencies, industries, job categories, skills, education
levels and qualification types (schema `src/db/schema/taxonomy.ts`, production seed `src/server/seed`).

## Reads (`queries.ts`, server-only, memoised per request)

`listCountries({ destinationsOnly? })`, `countryOptions()`, `listStates(countryCode)`, `listLanguages()`,
`listCurrencies()`, `currencyOptions()`, `listIndustries()`, `industryOptions()`, `jobCategoryOptions()`,
`searchSkills(q)` and the other helpers exported there. Public JSON feeds live under `/api/v1/taxonomy/*`.

## Write hooks (`service.ts`, server-only)

Skill names and synonyms, and job-category names, are copied into denormalised search columns
(`candidate_profiles.skillsText` / `skillNamesCache` / `preferredRolesText`, `jobs.skillsText` /
`categoryNameCache`). **Every write that renames a skill, changes its synonyms or renames a job category
must call the matching hook** (the admin taxonomy screens, imports, the reference seed):

```ts
import { afterCategoryChanged, afterSkillChanged } from "@/modules/taxonomy/service";

await afterSkillChanged(skillId, tx);       // candidates.refresh_skill + jobs.refresh_skill
await afterCategoryChanged(categoryId, tx); // candidates.refresh_category + jobs.refresh_category
```

Both only enqueue background tasks (batched, self-continuing; deduplicated per minute), so they are cheap to
call inside the edit's transaction — pass `tx` so the refresh is queued only if the edit commits.

Current callers: the reference seed (`seedSkills`) when it adds synonyms to a curated skill. There is no admin
rename screen yet; when one is built, call the hooks from its service.
