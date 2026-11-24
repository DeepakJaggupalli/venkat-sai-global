# Exports (`src/modules/exports`)

Staff Excel (.xlsx) downloads of lists of people. The workbook layout lives in `src/lib/xlsx-export.ts`
(`buildXlsx`: company row, title/filters/generated-time row, header row with S.No, formula neutralising, 5,000-row cap).

| File | Public API |
|---|---|
| `http.ts` | `staffExport({ permission, list, slug, build })` — GET handler body: authorise (same permission as the list page), rate limit, build, log (`logDataAccess` accessType `export` + `audit("export.downloaded")` with list, filters, row count and whether full phone/passport numbers were included); `queryObject(url)` |
| `people.ts` | `candidatePeople(ctx, candidateIds)` (name, trade, passport, phone, candidate notes, staff remarks), `applicationRemarks(ids)`, `exportVisibility(ctx)`, `formatPassport`, `formatPhone`, `formatEmail` |
| `cv-submissions.ts` | `cvSubmissionExportColumns(visibility)` and `CV_SUBMISSION_EXPORT_HEADERS`: the CV submissions / poster applicants sheet (S.No, Name, Trade, Passport No, Exp Abroad (yrs), Exp India (yrs), Email, Phone, Applied for, Applied on, Status, Preferred country, Passport expiry, Candidate notes, Staff remarks, then Total exp (yrs) and Reference so older single-figure experience and the VSG-CV reference are kept) |

Masking: full phone numbers and emails need `candidates.view_contact`; full passport numbers need
`candidates.view_documents` (otherwise `XXXX1234`). Routes: `/admin/cv-submissions/export` (also `?requirement=<poster id>`
for one poster's applicants), `/admin/candidates/export`, `/admin/pipeline/export`
(also `?job=` per job), `/admin/training/batches/[id]/export`, `/admin/partners/submissions/export`,
`/admin/resume-requests/export`; employers: `/employer/reports/export/xlsx` (aggregates only).
