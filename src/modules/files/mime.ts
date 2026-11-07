import "server-only";

import { fileTypeFromBuffer } from "file-type";

import { fileExtension, isAllowedMimeType, MIME, MIME_EXTENSIONS, type AllowedMimeType } from "./policies";
import { looksLikeSvg } from "./svg";

/**
 * Content-type detection from the bytes (magic numbers via `file-type`, plus a small text
 * classifier for formats without magic numbers), and the accept/reject decision against a
 * purpose policy. The client-declared type and the file extension are never trusted on their
 * own: they must agree with what the content actually is.
 */

export type SniffResult =
  | { kind: "binary"; mime: string; ext: string }
  | { kind: "text"; mime: "image/svg+xml" | "text/html" | "application/xml" | "application/json" | "text/plain" | "text/x-script" }
  | { kind: "unknown" };

const TEXT_SAMPLE_BYTES = 64 * 1024;

/** Heuristic: valid UTF-8 (or ASCII) without NUL bytes in the first 64 KiB. */
export function looksLikeText(data: Uint8Array): boolean {
  const sample = data.subarray(0, Math.min(data.byteLength, TEXT_SAMPLE_BYTES));
  if (sample.includes(0)) return false;
  try {
    // A multi-byte character may be cut at the sample boundary — trim up to 3 trailing bytes.
    const end = sample.byteLength === data.byteLength ? sample.byteLength : Math.max(0, sample.byteLength - 3);
    new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, end));
    return true;
  } catch {
    return false;
  }
}

/** Classify a text document by its leading content. */
export function classifyText(text: string): Extract<SniffResult, { kind: "text" }>["mime"] {
  const head = text.slice(0, 8192).replace(/^﻿/, "").trimStart();
  const lower = head.toLowerCase();
  if (looksLikeSvg(head)) return "image/svg+xml";
  if (/^<!doctype\s+html|^<html[\s>]|^<head[\s>]|^<body[\s>]|^<script[\s>]|^<iframe[\s>]/.test(lower)) return "text/html";
  if (/<script[\s>]/.test(lower) && /<(html|body|div|img|svg|iframe)[\s>]/.test(lower)) return "text/html";
  if (head.startsWith("#!")) return "text/x-script";
  if (head.startsWith("<?xml") || /^<[a-z_][\w.-]*[\s>/]/i.test(head)) return "application/xml";
  if ((head.startsWith("{") || head.startsWith("[")) && isJson(text)) return "application/json";
  return "text/plain";
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export async function sniffFileType(data: Uint8Array): Promise<SniffResult> {
  const detected = await fileTypeFromBuffer(data).catch(() => undefined);
  if (detected && detected.mime !== "application/xml") return { kind: "binary", mime: detected.mime, ext: detected.ext };
  if (looksLikeText(data)) {
    const text = new TextDecoder("utf-8").decode(data.subarray(0, Math.min(data.byteLength, 2 * TEXT_SAMPLE_BYTES)));
    return { kind: "text", mime: classifyText(text) };
  }
  return { kind: "unknown" };
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/** Never accepted for any purpose, whatever the content claims to be. */
const DANGEROUS_EXTENSIONS = new Set([
  "exe", "dll", "com", "scr", "msi", "msp", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "mjs", "cjs", "wsf", "wsh",
  "hta", "cpl", "jar", "apk", "app", "dmg", "pkg", "deb", "rpm", "sh", "bash", "zsh", "csh", "py", "pl", "rb", "php", "phtml",
  "asp", "aspx", "jsp", "cgi", "html", "htm", "xhtml", "shtml", "mht", "mhtml", "xht", "lnk", "url", "reg", "inf", "iso", "img",
  "vhd", "vhdx", "gadget", "sys", "drv", "ocx", "so", "dylib", "elf", "bin", "run", "swf", "chm", "docm", "dotm", "xlsm", "xltm",
  "xlam", "pptm", "potm", "ppsm", "sldm",
]);

const DANGEROUS_MIME_PREFIXES = [
  "application/x-msdownload",
  "application/vnd.microsoft.portable-executable",
  "application/x-elf",
  "application/x-mach-binary",
  "application/x-sharedlib",
  "application/x-executable",
  "application/java-archive",
  "application/java-vm",
  "application/vnd.android.package-archive",
  "application/x-apple-diskimage",
  "application/x-shockwave-flash",
  "application/vnd.ms-htmlhelp",
  "application/x-ms-shortcut",
  "application/wasm",
  "text/html",
  "text/x-script",
  "application/x-chrome-extension",
  "application/x-xpinstall",
  "application/x-deb",
  "application/x-rpm",
];

/** Client-declared types browsers commonly send for each stored type (empty / octet-stream are ignored). */
const DECLARED_ALIASES: Record<AllowedMimeType, readonly string[]> = {
  "image/jpeg": ["image/jpeg", "image/jpg", "image/pjpeg"],
  "image/png": ["image/png", "image/x-png"],
  "image/webp": ["image/webp"],
  "image/svg+xml": ["image/svg+xml"],
  "application/pdf": ["application/pdf", "application/x-pdf", "application/acrobat"],
  "application/msword": ["application/msword", "application/vnd.ms-word", "application/x-msword"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [MIME.docx, "application/zip"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [MIME.xlsx, "application/zip"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [MIME.pptx, "application/zip"],
  "text/plain": ["text/plain"],
  "text/csv": ["text/csv", "application/csv", "text/comma-separated-values", "text/x-csv", "application/vnd.ms-excel", "text/plain"],
  "application/json": ["application/json", "text/json", "text/plain"],
  "application/zip": ["application/zip", "application/x-zip-compressed", "multipart/x-zip"],
};

export type MimeDecision =
  | { ok: true; mimeType: AllowedMimeType; extension: string }
  | { ok: false; code: "type_not_allowed" | "type_mismatch" | "dangerous" | "unknown_type"; message: string };

export type MimeDecisionInput = {
  sniffed: SniffResult;
  declaredMimeType: string | null | undefined;
  fileName: string;
  allowed: readonly AllowedMimeType[];
  trusted: boolean;
};

const reject = (code: Exclude<MimeDecision, { ok: true }>["code"], message: string): MimeDecision => ({ ok: false, code, message });

function isDangerousMime(mime: string): boolean {
  return DANGEROUS_MIME_PREFIXES.some((p) => mime === p || mime.startsWith(`${p};`));
}

/** Map what the bytes are to the MIME type we would store, or null when unsupported. */
function effectiveMime(sniffed: SniffResult, extension: string): string | null {
  if (sniffed.kind === "unknown") return null;
  if (sniffed.kind === "binary") {
    // Legacy Office files are OLE compound files — the container is also used by .msi installers,
    // so only the matching extension makes it a Word document.
    if (sniffed.mime === "application/x-cfb") return extension === "doc" ? MIME.doc : "application/x-cfb";
    return sniffed.mime;
  }
  if (sniffed.mime === "text/plain") {
    if (extension === "csv") return MIME.csv;
    return MIME.txt;
  }
  if (sniffed.mime === "application/json") return extension === "json" ? MIME.json : extension === "txt" ? MIME.txt : MIME.json;
  return sniffed.mime;
}

/**
 * Decide whether an upload is acceptable for a purpose:
 *  1. dangerous extensions / executable or HTML content are always rejected;
 *  2. the content type (from the bytes) must be in the purpose's allow-list
 *     (SVG only for trusted purposes);
 *  3. a file extension, when present, must match the content type;
 *  4. the browser-declared type, when meaningful, must agree with the content type.
 */
export function decideMimeType(input: MimeDecisionInput): MimeDecision {
  const extension = fileExtension(input.fileName);
  if (extension && DANGEROUS_EXTENSIONS.has(extension)) {
    return reject("dangerous", "This type of file is not allowed for security reasons.");
  }

  const mime = effectiveMime(input.sniffed, extension);
  if (!mime) return reject("unknown_type", "We could not recognise this file type. Upload one of the allowed formats.");
  if (isDangerousMime(mime) || mime === "application/x-cfb") {
    return reject("dangerous", "This type of file is not allowed for security reasons.");
  }
  if (mime === MIME.svg && !input.trusted) {
    return reject("type_not_allowed", "SVG images are not accepted here. Upload a JPG, PNG or WebP image instead.");
  }
  if (!isAllowedMimeType(mime) || !input.allowed.includes(mime)) {
    return reject("type_not_allowed", "This file type is not accepted here.");
  }

  const validExtensions = MIME_EXTENSIONS[mime];
  if (extension && !validExtensions.includes(extension)) {
    return reject("type_mismatch", `The file name ends in .${extension} but the file is actually a ${validExtensions[0]!.toUpperCase()} file. Rename or re-save it and try again.`);
  }

  const declared = (input.declaredMimeType ?? "").split(";")[0]!.trim().toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== "binary/octet-stream" && !DECLARED_ALIASES[mime].includes(declared)) {
    return reject("type_mismatch", "The file's declared type does not match its content.");
  }

  return { ok: true, mimeType: mime, extension: validExtensions[0]! };
}
