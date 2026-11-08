# Exports (`src/modules/exports`)

Staff Excel (.xlsx) downloads of lists of people. The workbook layout lives in `src/lib/xlsx-export.ts`
(`buildXlsx`: company row, title/filters/generated-time row, header row with S.No, formula neutralising, 5,000-row cap).

| File | Public API |
|---|---|
| `http.ts` | `staffExport({ permission, list, slug, build })` — GET handler body: authorise (same permission as the list page), rate limit, build, log (`logDataAccess` accessType `export` + `audit("export.downloaded")` with list, filters, row count and whether full phone/passport numbers were included); `queryObject(url)` |
| `people.ts` | `candidatePeople(ctx, candidateIds)` (name, trade, passport, phone, candidate notes, staff remarks), `applicationRemarks(ids)`, `exportVisibility(ctx)`, `formatPassport`, `formatPhone` |

Masking: full phone numbers need `candidates.view_contact`; full passport numbers need `candidates.view_documents`
(otherwise `XXXX1234`). Routes: `/admin/cv-submissions/export`, `/admin/candidates/export`, `/admin/pipeline/export`
(also `?job=` per job), `/admin/training/batches/[id]/export`, `/admin/partners/submissions/export`,
`/admin/resume-requests/export`; employers: `/employer/reports/export/xlsx` (aggregates only).
