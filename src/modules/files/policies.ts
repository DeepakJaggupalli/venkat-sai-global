/**
 * Per-purpose file policies (client-safe: no server imports).
 *
 * Every uploaded or generated binary has a `purpose` (FILE_PURPOSES in src/db/schema/_constants.ts).
 * The purpose decides which types and sizes are accepted, the default visibility, how images are
 * processed, who may upload it and who may read it. The upload route, `storeFile()`,
 * `canAccessFile()` and the <FileUpload> client pre-check all read this table, so a rule changed
 * here applies everywhere.
 */
import type { OrgPermission, PlatformPermission } from "@/config/permissions";
import { FILE_PURPOSES, type FilePurpose, type FileVisibility, type OrgType } from "@/db/schema/_constants";

// ---------------------------------------------------------------------------
// MIME catalogue
// ---------------------------------------------------------------------------

export const MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
} as const;

export type AllowedMimeType = (typeof MIME)[keyof typeof MIME];

/** Canonical file extensions per stored MIME type (first = preferred). */
export const MIME_EXTENSIONS: Record<AllowedMimeType, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/svg+xml": ["svg"],
  "application/pdf": ["pdf"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "text/plain": ["txt"],
  "text/csv": ["csv"],
  "application/json": ["json"],
  "application/zip": ["zip"],
};

/** Short human label per MIME type (upload hints, file links). */
export const MIME_LABELS: Record<AllowedMimeType, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/svg+xml": "SVG",
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "text/plain": "TXT",
  "text/csv": "CSV",
  "application/json": "JSON",
  "application/zip": "ZIP",
};

const RASTER_IMAGES = [MIME.jpeg, MIME.png, MIME.webp] as const;
const DOCUMENTS = [MIME.pdf, MIME.docx, MIME.doc] as const;
const SCANS = [MIME.pdf, ...RASTER_IMAGES] as const;

export function isRasterImageMime(mime: string | null | undefined): mime is (typeof RASTER_IMAGES)[number] {
  return !!mime && (RASTER_IMAGES as readonly string[]).includes(mime);
}

export function isAllowedMimeType(mime: string): mime is AllowedMimeType {
  return Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, mime);
}

// ---------------------------------------------------------------------------
// Image variants
// ---------------------------------------------------------------------------

export const IMAGE_VARIANTS = ["thumb", "md", "lg"] as const;
export type ImageVariantName = (typeof IMAGE_VARIANTS)[number];

/** Longest side (px) of each generated WebP variant. */
export const IMAGE_VARIANT_SIZES: Record<ImageVariantName, number> = { thumb: 320, md: 960, lg: 1600 };

// ---------------------------------------------------------------------------
// Policy shape
// ---------------------------------------------------------------------------

/**
 * Who may upload a purpose through POST /api/v1/uploads (any matching rule authorises):
 *  - self:   any signed-in user; the file is owned by them (candidate files, avatars, attachments).
 *  - staff:  Venkat Sai staff holding ANY of the permissions.
 *  - org:    an active member of the `organizationId` sent with the upload, of one of `orgTypes`,
 *            holding ANY of `permissions` (empty list = any active member).
 *  - system: generated on the server only (never accepted from the upload route).
 */
export type UploadRule =
  | { kind: "self" }
  | { kind: "staff"; permissions: readonly PlatformPermission[] }
  | { kind: "org"; orgTypes: readonly OrgType[]; permissions: readonly OrgPermission[] }
  | { kind: "system" };

export type FilePolicy = {
  purpose: FilePurpose;
  label: string;
  allowedMimeTypes: readonly AllowedMimeType[];
  maxBytes: number;
  defaultVisibility: FileVisibility;
  /** Whether the file may be made public (on upload or later via setFileVisibility). */
  allowPublic: boolean;
  /** WebP variants generated for raster images (metadata is stripped from every image regardless). */
  imageVariants: readonly ImageVariantName[];
  /** Uploaded only by trusted staff (CMS): SVG without active content is accepted. */
  trusted: boolean;
  /** Personal or confidential content: non-owner reads are logged and never cached. */
  sensitive: boolean;
  /** data_access_logs.dataCategory used when a sensitive file is read by someone other than its owner. */
  dataCategory: string;
  upload: readonly UploadRule[];
  /** Staff permissions (ANY of) that grant read access. Empty = no permission-based staff access. */
  staffView: readonly PlatformPermission[];
  /**
   * Members of the file's organisation (files.organizationId) who may read it.
   * `permissions` empty = any active member. null = organisation membership grants nothing.
   */
  orgView: { permissions: readonly OrgPermission[] } | null;
  /** Only the owner may ever read (no grants, organisation or staff access). */
  ownerOnly: boolean;
};

const MB = 1024 * 1024;

const ORG_PROFILE_MANAGERS = ["employer.company.manage", "partner.profile.manage", "institution.profile.manage"] as const satisfies readonly OrgPermission[];
const PARTNER_CANDIDATE_HANDLERS = ["partner.candidates.submit", "partner.documents.manage"] as const satisfies readonly OrgPermission[];
const PARTNER_CANDIDATE_VIEWERS = ["partner.candidates.submit", "partner.documents.manage", "partner.submissions.view"] as const satisfies readonly OrgPermission[];
const ALL_ORG_TYPES = ["employer", "recruitment_partner", "institution"] as const satisfies readonly OrgType[];
/** May attach organisation documents without managing the profile: placement evidence, partner invoices (read stays with profile managers + the uploader). */
const ORG_DOCUMENT_UPLOADERS = [...ORG_PROFILE_MANAGERS, "institution.placements.manage", "partner.settlements.view"] as const satisfies readonly OrgPermission[];

const base = {
  defaultVisibility: "private",
  allowPublic: false,
  imageVariants: [],
  trusted: false,
  sensitive: false,
  dataCategory: "documents",
  staffView: [],
  orgView: null,
  ownerOnly: false,
} as const satisfies Partial<FilePolicy>;

export const FILE_POLICIES: Record<FilePurpose, FilePolicy> = {
  avatar: {
    ...base,
    purpose: "avatar",
    label: "Profile photo",
    allowedMimeTypes: RASTER_IMAGES,
    maxBytes: 5 * MB,
    allowPublic: true,
    imageVariants: ["thumb", "md"],
    dataCategory: "profile",
    upload: [{ kind: "self" }],
    staffView: ["users.view", "candidates.view"],
  },
  resume: {
    ...base,
    purpose: "resume",
    label: "Resume / CV",
    allowedMimeTypes: DOCUMENTS,
    maxBytes: 10 * MB,
    sensitive: true,
    upload: [
      { kind: "self" },
      { kind: "org", orgTypes: ["recruitment_partner"], permissions: PARTNER_CANDIDATE_HANDLERS },
      { kind: "staff", permissions: ["candidates.manage"] },
    ],
    staffView: ["candidates.view_documents"],
    orgView: { permissions: PARTNER_CANDIDATE_VIEWERS },
  },
  candidate_document: {
    ...base,
    purpose: "candidate_document",
    label: "Candidate document",
    allowedMimeTypes: [...SCANS, MIME.docx],
    maxBytes: 10 * MB,
    imageVariants: ["thumb"],
    sensitive: true,
    upload: [
      { kind: "self" },
      { kind: "org", orgTypes: ["recruitment_partner"], permissions: PARTNER_CANDIDATE_HANDLERS },
      { kind: "staff", permissions: ["candidates.manage", "candidates.verify"] },
    ],
    staffView: ["candidates.view_documents"],
    orgView: { permissions: PARTNER_CANDIDATE_VIEWERS },
  },
  candidate_credential: {
    ...base,
    purpose: "candidate_credential",
    label: "Certificate or licence",
    allowedMimeTypes: SCANS,
    maxBytes: 10 * MB,
    imageVariants: ["thumb"],
    sensitive: true,
    upload: [
      { kind: "self" },
      { kind: "org", orgTypes: ["recruitment_partner"], permissions: PARTNER_CANDIDATE_HANDLERS },
      { kind: "staff", permissions: ["candidates.manage", "candidates.verify"] },
    ],
    staffView: ["candidates.view_documents"],
    orgView: { permissions: PARTNER_CANDIDATE_VIEWERS },
  },
  portfolio_media: {
    ...base,
    purpose: "portfolio_media",
    label: "Portfolio image",
    allowedMimeTypes: SCANS,
    maxBytes: 15 * MB,
    allowPublic: true,
    imageVariants: ["thumb", "md", "lg"],
    dataCategory: "profile",
    upload: [{ kind: "self" }],
    staffView: ["candidates.view"],
  },
  application_attachment: {
    ...base,
    purpose: "application_attachment",
    label: "Application attachment",
    allowedMimeTypes: [...SCANS, MIME.docx, MIME.doc],
    maxBytes: 10 * MB,
    imageVariants: ["thumb"],
    sensitive: true,
    upload: [
      { kind: "self" },
      { kind: "org", orgTypes: ["recruitment_partner"], permissions: ["partner.candidates.submit"] },
      { kind: "staff", permissions: ["recruitment.manage"] },
    ],
    staffView: ["candidates.view_documents"],
    orgView: { permissions: PARTNER_CANDIDATE_VIEWERS },
  },
  org_logo: {
    ...base,
    purpose: "org_logo",
    label: "Organisation logo",
    allowedMimeTypes: RASTER_IMAGES,
    maxBytes: 5 * MB,
    defaultVisibility: "public",
    allowPublic: true,
    imageVariants: ["thumb", "md"],
    dataCategory: "organization",
    upload: [
      { kind: "org", orgTypes: ALL_ORG_TYPES, permissions: ORG_PROFILE_MANAGERS },
      { kind: "staff", permissions: ["orgs.manage"] },
    ],
    staffView: ["orgs.view"],
    orgView: { permissions: [] },
  },
  org_document: {
    ...base,
    purpose: "org_document",
    label: "Organisation document",
    allowedMimeTypes: SCANS,
    maxBytes: 15 * MB,
    imageVariants: ["thumb"],
    sensitive: true,
    dataCategory: "organization_documents",
    upload: [
      { kind: "org", orgTypes: ALL_ORG_TYPES, permissions: ORG_DOCUMENT_UPLOADERS },
      { kind: "staff", permissions: ["orgs.manage", "orgs.verify"] },
    ],
    staffView: ["orgs.view"],
    orgView: { permissions: ORG_PROFILE_MANAGERS },
  },
  partner_licence: {
    ...base,
    purpose: "partner_licence",
    label: "Recruitment licence",
    allowedMimeTypes: SCANS,
    maxBytes: 15 * MB,
    imageVariants: ["thumb"],
    sensitive: true,
    dataCategory: "organization_documents",
    upload: [
      { kind: "org", orgTypes: ["recruitment_partner"], permissions: ["partner.profile.manage"] },
      { kind: "staff", permissions: ["orgs.manage", "orgs.verify"] },
    ],
    staffView: ["orgs.view"],
    orgView: { permissions: ["partner.profile.manage"] },
  },
  mobilisation_document: {
    ...base,
    purpose: "mobilisation_document",
    label: "Mobilisation document",
    allowedMimeTypes: SCANS,
    maxBytes: 15 * MB,
    imageVariants: ["thumb"],
    sensitive: true,
    upload: [
      { kind: "self" },
      { kind: "org", orgTypes: ["recruitment_partner"], permissions: ["partner.documents.manage"] },
      { kind: "staff", permissions: ["recruitment.mobilisation"] },
    ],
    staffView: ["candidates.view_documents"],
    orgView: { permissions: ["partner.documents.manage"] },
  },
  certificate: {
    ...base,
    purpose: "certificate",
    label: "Issued certificate",
    allowedMimeTypes: SCANS,
    maxBytes: 10 * MB,
    allowPublic: true,
    imageVariants: ["thumb", "md"],
    upload: [
      { kind: "staff", permissions: ["training.certificates"] },
      { kind: "org", orgTypes: ["institution"], permissions: ["institution.certificates.issue"] },
      { kind: "system" },
    ],
    staffView: ["training.view", "candidates.view_documents"],
    orgView: { permissions: ["institution.certificates.issue", "institution.students.manage"] },
  },
  assessment_evidence: {
    ...base,
    purpose: "assessment_evidence",
    label: "Assessment evidence",
    allowedMimeTypes: SCANS,
    maxBytes: 15 * MB,
    imageVariants: ["thumb", "md"],
    sensitive: true,
    upload: [
      { kind: "staff", permissions: ["recruitment.assessments", "training.manage"] },
      { kind: "org", orgTypes: ["institution"], permissions: ["institution.assessments.manage"] },
      { kind: "system" },
    ],
    staffView: ["training.view", "candidates.view_documents", "recruitment.assessments"],
    orgView: { permissions: ["institution.assessments.manage"] },
  },
  placement_evidence: {
    ...base,
    purpose: "placement_evidence",
    label: "Placement evidence",
    allowedMimeTypes: [...SCANS, MIME.docx],
    maxBytes: 10 * MB,
    imageVariants: ["thumb"],
    sensitive: true,
    upload: [
      { kind: "staff", permissions: ["training.manage", "recruitment.mobilisation"] },
      { kind: "org", orgTypes: ["institution"], permissions: ["institution.placements.manage"] },
    ],
    staffView: ["candidates.view_documents", "training.view"],
    orgView: { permissions: ["institution.placements.manage"] },
  },
  course_material: {
    ...base,
    purpose: "course_material",
    label: "Course material",
    allowedMimeTypes: [...SCANS, MIME.docx, MIME.pptx, MIME.xlsx],
    maxBytes: 25 * MB,
    allowPublic: true,
    imageVariants: ["thumb", "md", "lg"],
    dataCategory: "training",
    upload: [
      { kind: "staff", permissions: ["training.manage"] },
      { kind: "org", orgTypes: ["institution"], permissions: ["institution.courses.manage"] },
    ],
    staffView: ["training.view"],
    orgView: { permissions: [] },
  },
  cms_media: {
    ...base,
    purpose: "cms_media",
    label: "Media library file",
    allowedMimeTypes: [...RASTER_IMAGES, MIME.svg, MIME.pdf],
    maxBytes: 20 * MB,
    defaultVisibility: "public",
    allowPublic: true,
    imageVariants: ["thumb", "md", "lg"],
    trusted: true,
    dataCategory: "content",
    upload: [{ kind: "staff", permissions: ["media.manage"] }],
    staffView: ["media.manage"],
  },
  ticket_attachment: {
    ...base,
    purpose: "ticket_attachment",
    label: "Support attachment",
    allowedMimeTypes: [...SCANS, MIME.docx, MIME.xlsx, MIME.csv, MIME.txt],
    maxBytes: 10 * MB,
    imageVariants: ["thumb"],
    dataCategory: "support",
    upload: [{ kind: "self" }, { kind: "org", orgTypes: ALL_ORG_TYPES, permissions: [] }],
    staffView: ["support.view"],
    orgView: { permissions: [] },
  },
  message_attachment: {
    ...base,
    purpose: "message_attachment",
    label: "Message attachment",
    allowedMimeTypes: [...SCANS, MIME.docx, MIME.doc, MIME.xlsx, MIME.csv, MIME.txt],
    maxBytes: 15 * MB,
    imageVariants: ["thumb"],
    dataCategory: "messages",
    upload: [{ kind: "self" }, { kind: "org", orgTypes: ALL_ORG_TYPES, permissions: [] }],
    staffView: ["recruitment.view", "requirements.view", "partners.view"],
    orgView: { permissions: [] },
  },
  invoice: {
    ...base,
    purpose: "invoice",
    label: "Invoice",
    allowedMimeTypes: [MIME.pdf],
    maxBytes: 10 * MB,
    sensitive: true,
    dataCategory: "payment",
    upload: [{ kind: "staff", permissions: ["commercial.invoices"] }, { kind: "system" }],
    staffView: ["commercial.view"],
    orgView: {
      permissions: ["employer.billing.view", "employer.billing.manage", "partner.billing.manage", "partner.settlements.view", "institution.billing.manage"],
    },
  },
  data_export: {
    ...base,
    purpose: "data_export",
    label: "Personal data export",
    allowedMimeTypes: [MIME.zip, MIME.json, MIME.csv, MIME.pdf],
    maxBytes: 500 * MB,
    sensitive: true,
    dataCategory: "export",
    upload: [{ kind: "system" }],
    ownerOnly: true,
  },
  other: {
    ...base,
    purpose: "other",
    label: "File",
    allowedMimeTypes: [...SCANS, MIME.docx, MIME.xlsx, MIME.csv, MIME.txt],
    maxBytes: 10 * MB,
    upload: [{ kind: "staff", permissions: ["settings.manage"] }, { kind: "system" }],
  },
};

export function getFilePolicy(purpose: FilePurpose): FilePolicy {
  const policy = FILE_POLICIES[purpose];
  if (!policy) throw new Error(`Unknown file purpose: ${String(purpose)}`);
  return policy;
}

export function isFilePurpose(value: unknown): value is FilePurpose {
  return typeof value === "string" && (FILE_PURPOSES as readonly string[]).includes(value);
}

/** Purposes that can be uploaded through POST /api/v1/uploads (not server-generated only). */
export function isUploadablePurpose(purpose: FilePurpose): boolean {
  return getFilePolicy(purpose).upload.some((rule) => rule.kind !== "system");
}

// ---------------------------------------------------------------------------
// Client view (used by <FileUpload> for pre-checks and hints)
// ---------------------------------------------------------------------------

export type ClientFilePolicy = {
  purpose: FilePurpose;
  label: string;
  maxBytes: number;
  allowedMimeTypes: readonly AllowedMimeType[];
  extensions: readonly string[];
  /** Value for <input type="file" accept>. */
  accept: string;
  /** e.g. "PDF, DOCX or DOC". */
  typesLabel: string;
};

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

export function getClientFilePolicy(purpose: FilePurpose): ClientFilePolicy {
  const policy = getFilePolicy(purpose);
  const extensions = policy.allowedMimeTypes.flatMap((m) => MIME_EXTENSIONS[m]);
  const labels = [...new Set(policy.allowedMimeTypes.map((m) => MIME_LABELS[m]))];
  return {
    purpose,
    label: policy.label,
    maxBytes: policy.maxBytes,
    allowedMimeTypes: policy.allowedMimeTypes,
    extensions,
    accept: [...policy.allowedMimeTypes, ...extensions.map((e) => `.${e}`)].join(","),
    typesLabel: joinLabels(labels),
  };
}

/** Lower-cased extension of a file name without the dot ("" when none). */
export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Client-side pre-check (the server re-validates everything with magic-byte sniffing).
 * Returns null when the file looks acceptable, else a reason code.
 */
export function precheckFile(policy: ClientFilePolicy, file: { name: string; size: number; type: string }): "too_large" | "empty" | "type_not_allowed" | null {
  if (file.size === 0) return "empty";
  if (file.size > policy.maxBytes) return "too_large";
  const ext = fileExtension(file.name);
  const typeOk = file.type ? (policy.allowedMimeTypes as readonly string[]).includes(file.type) : false;
  const extOk = ext ? policy.extensions.includes(ext) : false;
  // Browsers report unreliable types for some files (e.g. CSV as application/vnd.ms-excel), so a
  // known extension is enough here; the server decides from the content.
  return typeOk || extOk ? null : "type_not_allowed";
}
