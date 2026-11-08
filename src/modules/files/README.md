# Files module (`src/modules/files`)

Every uploaded or generated binary goes through this module: per-purpose policies, magic-byte
sniffing, malware scanning, privacy-preserving image processing, storage drivers, access control,
explicit sharing grants and the HTTP routes that serve files. Owner: platform infrastructure.

```
Browser ── <FileUpload purpose name> ── POST /api/v1/uploads ──► authorizeUpload() ──► storeFile()
                                                                                         │
             size limit → sniff (file-type) → extension/declared type must agree → SVG check
             → ClamAV INSTREAM (optional) → sharp: auto-rotate + strip ALL metadata + WebP variants
             → storage driver (local | S3 | Vercel Blob) → files row  (deferred work → "files.process" task)

Reads:  private  GET /api/v1/files/<id>[?variant&download]   checkFileAccess() + data-access log
        public   GET /media/<id>/<name>[?variant&download]   public files only, immutable cache
```

### Storage drivers (`STORAGE_DRIVER`)

| Driver | Use | Configuration |
|---|---|---|
| `local` | development, single-server hosts | `STORAGE_LOCAL_DIR` (outside `/public`) |
| `blob` | Vercel deployments (staging/production) | a **private** Vercel Blob store connected to the project (`BLOB_READ_WRITE_TOKEN`). Objects are written with `access: "private"` and read with the token, so every read still goes through the app's access checks. |
| `s3` | AWS S3, Cloudflare R2, MinIO… | `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_REGION` |

Each `files` row records its driver, so switching `STORAGE_DRIVER` keeps older files readable while both drivers stay configured.

## Public API

### Server (`import { … } from "@/modules/files"`, server-only)

| Function | Signature | Notes |
|---|---|---|
| `storeFile` | `(input: StoreFileInput) => Promise<FileRow>` | The pipeline above. `input`: `data: Uint8Array`, `originalName`, `declaredMimeType?`, `purpose`, `ownerUserId`, `organizationId?`, `visibility?`, `deferProcessing?`, `metadata?`, `tx?`. Throws `FileValidationError` (`code`, HTTP `status`, safe `message`). Does **not** authorise the caller — the upload route / your service must. |
| `getFile` | `(id: string, tx?) => Promise<FileRow \| null>` | Not soft-deleted. **No access check.** Invalid ids return null (no DB error). |
| `getFiles` | `(ids: readonly string[], tx?) => Promise<FileRow[]>` | Same, batched. |
| `requireUploadedFile` | `(fileId, { purposes, ownerUserId?, organizationId? }, tx?) => Promise<FileRow>` | **Use in every action that receives a file id from a form** before linking it. Throws `ActionError` (missing, wrong purpose, not owned by the user/organisation, quarantined). |
| `canAccessFile` | `(viewer: FileViewer \| null, file) => Promise<boolean>` | Full access rules (below), including grants. |
| `checkFileAccess` | `(viewer, file) => Promise<FileAccessDecision>` | `{ allowed: true, via, organizationId }` or `{ allowed: false, reason }` (`not_found`, `unauthenticated`, `forbidden`, `quarantined`, `processing`). |
| `getCurrentFileViewer` | `() => Promise<FileViewer \| null>` | Signed-in viewer (memoised per request): staff permissions (empty until required 2FA is set up) + active org memberships. |
| `loadFileViewer` | `(userId: string) => Promise<FileViewer \| null>` | Viewer for background jobs. |
| `grantFileAccess` | `(input: GrantFileAccessInput, { tx? }) => Promise<{ id, created }>` | Give one user **or** one organisation read access (`reason`, `contextType?`, `contextId?`, `expiresAt?`, `grantedByUserId?`). Idempotent per (file, grantee, context). Audited. Data exports cannot be shared. The **caller** must have checked consent/permissions. |
| `revokeFileAccess` | `({ grantId } \| { fileId, granteeUserId?, granteeOrganizationId?, contextType?, contextId? }, { revokedByUserId?, tx? }) => Promise<number>` | Revokes matching active grants. Audited. |
| `listFileGrants` | `(fileId) => Promise<FileAccessGrantRow[]>` | Newest first. |
| `setFileVisibility` | `(fileId, "public" \| "private", { actorUserId, tx? }) => Promise<FileRow>` | Enforces `allowPublic`; audited. Caller authorises. |
| `softDeleteFile` | `(fileId, { actorUserId, reason?, tx? }) => Promise<boolean>` | Stops serving immediately; bytes purged after `FILE_PURGE_GRACE_DAYS` (30) by `files.purge`. Row kept (FKs). Audited. |
| `openFileContent` | `(file, variant \| null) => Promise<FileContent \| null>` | Stream + type + ETag (routes use it). |
| `fileUrl` | `(file, { variant?, download? }) => string` | Public → `/media/<id>/<safe-name>`, private → `/api/v1/files/<id>`. Relative — wrap with `absoluteUrl()` for emails. |
| `thumbnailUrl` | `(file) => string \| null` | WebP thumbnail URL for raster images. |
| `toUploadedFile` / `toFileSummary` | `(row) => UploadedFile / FileSummary` | DTOs for client components. |
| `getFilePolicy`, `FILE_POLICIES` | | Policy table (also client-safe from `./policies`). |

Client-safe imports: `@/modules/files/policies` (`getClientFilePolicy`, `precheckFile`, `MIME`…),
`@/modules/files/urls` (`fileUrl`, `thumbnailUrl`), `@/modules/files/present`, `@/modules/files/types`.

### Components (`import { FileUpload, FilePreview, FileLink } from "@/components/files"`)

- **`<FileUpload purpose name … />`** (client) — drag and drop + click, single or `multiple`
  (`maxFiles`, default 10), XHR upload with progress, client-side size/type pre-check from the
  policy, image previews, remove/cancel, polite live-region announcements, blocks the surrounding
  form from submitting while uploads run. Writes hidden inputs: `name` (single) or `name[]`
  (multiple; one empty input when none, so the action receives `[]`).
  Props: `purpose`, `name`, `multiple?`, `maxFiles?`, `organizationId?`, `visibility?`,
  `defaultFiles?: FileSummary[]`, `label?`, `description?`, `id?`, `required?`, `disabled?`,
  `invalid?`, `errorId?` (id of your FieldError, added to `aria-describedby`), `messages?`,
  `onChange?(files)`, `onUploadingChange?(uploading)`, `className?`.
  Text is English by default; inside `<I18nProvider>` it uses `common` keys `files.<key>` (keys
  listed in `FILE_UPLOAD_DEFAULT_MESSAGES`) when the catalogue has them; `messages` overrides both.
- **`<FilePreview file size? showDetails? />`** — thumbnail (images) or type icon + name/type/size.
  Works in server components.
- **`<FileLink file download? showMeta? />`** — open in a new tab or download; accessible name
  includes type and size.

### Background tasks (`tasks.ts`)

- `files.process` `{ fileId }` — deferred malware scan (retried with backoff while ClamAV is
  unavailable) and missing image variants. Enqueued by `storeFile` when `deferProcessing` is set or
  the scanner failed at upload.
- `files.purge` `{ fileId }` — deletes the stored bytes of a soft-deleted file after 30 days.
  `system.cleanup` sweeps overdue purges as a safety net.

## Typical use

```tsx
// Client form (People Portal)
<FileUpload purpose="resume" name="resumeFileId" label="Resume" defaultFiles={resume ? [resume] : []}
            invalid={!!state?.fieldErrors?.resumeFileId} errorId="resume-error" />
```

```ts
// Server action / service
const file = await requireUploadedFile(input.resumeFileId, { purposes: ["resume"], ownerUserId: user.id });
await db.update(candidateProfiles).set({ resumeFileId: file.id }).where(eq(candidateProfiles.id, candidate.id));

// When a candidate applies: let the employer organisation read the resume for this application.
await grantFileAccess({ fileId: file.id, granteeOrganizationId: job.organizationId, reason: "Job application",
                        contextType: "application", contextId: application.id, grantedByUserId: user.id }, { tx });
// On withdrawal:
await revokeFileAccess({ fileId: file.id, contextType: "application", contextId: application.id }, { tx });

// Showing a file to the signed-in user
if (await canAccessFile(await getCurrentFileViewer(), file)) link = fileUrl(file, { download: true });
```

## Policies (per `FILE_PURPOSES` value)

| Purpose | Types | Max | Default visibility | Variants | Upload (any of) | Staff read | Org members read |
|---|---|---|---|---|---|---|---|
| avatar | JPG PNG WebP | 5 MB | private (may be public) | thumb, md | self | users.view / candidates.view | — |
| resume | PDF DOCX DOC | 10 MB | private | — | self · partner (candidates.submit / documents.manage) · staff candidates.manage | candidates.view_documents | uploading partner org |
| candidate_document | PDF images DOCX | 10 MB | private | thumb | self · partner · staff candidates.manage/verify | candidates.view_documents | uploading partner org |
| candidate_credential | PDF images | 10 MB | private | thumb | self · partner · staff | candidates.view_documents | uploading partner org |
| portfolio_media | PDF images | 15 MB | private (may be public) | thumb, md, lg | self | candidates.view | — |
| application_attachment | PDF images DOCX DOC | 10 MB | private | thumb | self · partner candidates.submit · staff recruitment.manage | candidates.view_documents | uploading partner org |
| org_logo | JPG PNG WebP | 5 MB | **public** | thumb, md | org profile managers · staff orgs.manage | orgs.view | any member |
| org_document | PDF images | 15 MB | private | thumb | org profile managers · staff orgs.manage/verify | orgs.view | profile managers |
| partner_licence | PDF images | 15 MB | private | thumb | partner.profile.manage · staff orgs.manage/verify | orgs.view | partner.profile.manage |
| mobilisation_document | PDF images | 15 MB | private | thumb | self · partner documents.manage · staff recruitment.mobilisation | candidates.view_documents | partner documents.manage |
| certificate | PDF images | 10 MB | private (may be public) | thumb, md | staff training.certificates · institution certificates.issue · system | training.view / candidates.view_documents | institution issuers |
| course_material | PDF images DOCX PPTX XLSX | 25 MB | private (may be public) | thumb, md, lg | staff training.manage · institution courses.manage | training.view | any member |
| cms_media | JPG PNG WebP **SVG** PDF | 20 MB | **public** | thumb, md, lg | staff media.manage (trusted) | media.manage | — |
| ticket_attachment | PDF images DOCX XLSX CSV TXT | 10 MB | private | thumb | self · any org member | support.view | any member |
| message_attachment | PDF images DOCX DOC XLSX CSV TXT | 15 MB | private | thumb | self · any org member | recruitment.view / requirements.view / partners.view | any member |
| cv_submission | PDF DOC DOCX JPG PNG | 4 MB | private | — | system only (public /send-cv route handler, no owner) | candidates.view_documents / recruitment.manage | — |
| invoice | PDF | 10 MB | private | — | staff commercial.invoices · system | commercial.view | billing roles |
| data_export | ZIP JSON CSV PDF | 500 MB | private | — | system only | **owner only** | **owner only** |
| other | PDF images DOCX XLSX CSV TXT | 10 MB | private | — | staff settings.manage · system | — | — |

"self" = any signed-in user (the file is owned by them). Organisation-member access only applies
when the file was uploaded for that organisation (`files.organizationId`).

## Access rules (`access-rules.ts`)

1. deleted → not found · 2. public → anyone · 3. signed out → unauthenticated · 4. owner → allowed ·
5. owner-only purposes (data exports) → nobody else · 6. active explicit grant (user, or one of the
viewer's organisations; not revoked/expired) · 7. members of the file's organisation with the
policy's org permission · 8. staff holding one of the policy's staff permissions.
Then: infected files are **never** served (quarantine); files waiting for a scan verdict
(`pending`/`error`) are served to their owner only. Sensitive purposes read by anyone other than
the owner are recorded with `logDataAccess()` and sent with `Cache-Control: private, no-store`.

## Security notes

- Content type comes from the bytes, never the browser. Extensions and declared types must agree;
  executables, scripts, HTML, macro-enabled Office files and OLE containers that are not `.doc`
  are rejected for every purpose. SVG is accepted only for staff CMS media and only without
  scripts, event handlers, external references, DTDs or `foreignObject`; files are served with
  `X-Content-Type-Options: nosniff`, a safe `Content-Disposition` and a sandboxing CSP (PDFs
  excepted — Chromium's viewer refuses sandboxed documents).
- Every raster image is re-encoded: EXIF orientation applied, **all metadata (GPS, EXIF, XMP, IPTC)
  removed**. `files.metadata.uploadSha256` keeps the hash of the original upload.
- Storage keys are `yyyy/mm/<file-id>` (+ `.<variant>.webp`); the local driver refuses any other
  key, so paths cannot escape `STORAGE_LOCAL_DIR`.
- Public `/media` URLs are cached for a year by browsers/CDNs: making a file private or deleting
  it later does not recall copies already fetched. Use private visibility for anything personal.

## Limitations / follow-ups

- Uploads go through the app; serverless hosts with small request-body limits (Vercel: 4.5 MB)
  cap uploads accordingly — see docs/OPERATIONS.md. Direct-to-S3 presigned uploads are not
  implemented.
- Orphaned uploads (uploaded, never linked to a record) are not garbage-collected automatically;
  that needs a registry of every column that references `files.id`.
