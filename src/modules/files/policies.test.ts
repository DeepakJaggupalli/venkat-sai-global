import { describe, expect, it } from "vitest";

import { FILE_PURPOSES } from "@/db/schema/_constants";
import { PLATFORM_PERMISSIONS, EMPLOYER_PERMISSIONS, PARTNER_PERMISSIONS, INSTITUTION_PERMISSIONS } from "@/config/permissions";

import { FILE_POLICIES, MIME, MIME_EXTENSIONS, fileExtension, getClientFilePolicy, getFilePolicy, isUploadablePurpose, precheckFile } from "./policies";

const platformKeys = new Set<string>(PLATFORM_PERMISSIONS.map((p) => p.key));
const orgKeys = new Set<string>([...EMPLOYER_PERMISSIONS, ...PARTNER_PERMISSIONS, ...INSTITUTION_PERMISSIONS].map((p) => p.key));

describe("file policies", () => {
  it("defines a policy for every FILE_PURPOSES value", () => {
    for (const purpose of FILE_PURPOSES) {
      const policy = getFilePolicy(purpose);
      expect(policy.purpose).toBe(purpose);
      expect(policy.allowedMimeTypes.length).toBeGreaterThan(0);
      expect(policy.maxBytes).toBeGreaterThan(0);
      expect(policy.upload.length).toBeGreaterThan(0);
    }
    expect(Object.keys(FILE_POLICIES).sort()).toEqual([...FILE_PURPOSES].sort());
  });

  it("only uses known MIME types and permission keys", () => {
    for (const policy of Object.values(FILE_POLICIES)) {
      for (const mime of policy.allowedMimeTypes) expect(MIME_EXTENSIONS[mime]).toBeDefined();
      for (const p of policy.staffView) expect(platformKeys.has(p)).toBe(true);
      for (const p of policy.orgView?.permissions ?? []) expect(orgKeys.has(p)).toBe(true);
      for (const rule of policy.upload) {
        if (rule.kind === "staff") for (const p of rule.permissions) expect(platformKeys.has(p)).toBe(true);
        if (rule.kind === "org") for (const p of rule.permissions) expect(orgKeys.has(p)).toBe(true);
      }
    }
  });

  it("accepts SVG only for trusted (staff) purposes", () => {
    for (const policy of Object.values(FILE_POLICIES)) {
      if (policy.allowedMimeTypes.includes(MIME.svg)) expect(policy.trusted).toBe(true);
      if (policy.trusted) expect(policy.upload.every((r) => r.kind === "staff" || r.kind === "system")).toBe(true);
    }
  });

  it("keeps candidate documents private, sensitive and visible to staff only with candidates.view_documents", () => {
    for (const purpose of ["resume", "candidate_document", "candidate_credential", "application_attachment", "mobilisation_document"] as const) {
      const p = getFilePolicy(purpose);
      expect(p.defaultVisibility).toBe("private");
      expect(p.allowPublic).toBe(false);
      expect(p.sensitive).toBe(true);
      expect(p.staffView).toEqual(["candidates.view_documents"]);
      expect(p.upload.some((r) => r.kind === "self")).toBe(true);
    }
  });

  it("matches the documented staff permissions for organisation, CMS, invoice and support files", () => {
    expect(getFilePolicy("org_document").staffView).toEqual(["orgs.view"]);
    expect(getFilePolicy("partner_licence").staffView).toEqual(["orgs.view"]);
    expect(getFilePolicy("cms_media").staffView).toEqual(["media.manage"]);
    expect(getFilePolicy("cms_media").upload).toEqual([{ kind: "staff", permissions: ["media.manage"] }]);
    expect(getFilePolicy("invoice").staffView).toEqual(["commercial.view"]);
    expect(getFilePolicy("ticket_attachment").staffView).toEqual(["support.view"]);
  });

  it("makes data exports owner-only and never uploadable", () => {
    const p = getFilePolicy("data_export");
    expect(p.ownerOnly).toBe(true);
    expect(p.staffView).toEqual([]);
    expect(p.orgView).toBeNull();
    expect(isUploadablePurpose("data_export")).toBe(false);
    expect(isUploadablePurpose("resume")).toBe(true);
  });

  it("only lets public-by-default purposes be public", () => {
    for (const policy of Object.values(FILE_POLICIES)) {
      if (policy.defaultVisibility === "public") expect(policy.allowPublic).toBe(true);
    }
    expect(getFilePolicy("org_logo").defaultVisibility).toBe("public");
    expect(getFilePolicy("cms_media").defaultVisibility).toBe("public");
  });
});

describe("client policy and pre-check", () => {
  it("builds an accept attribute with MIME types and extensions", () => {
    const resume = getClientFilePolicy("resume");
    expect(resume.accept).toContain("application/pdf");
    expect(resume.accept).toContain(".docx");
    expect(resume.accept).toContain(".doc");
    expect(resume.typesLabel).toBe("PDF, DOCX or DOC");
  });

  it("rejects empty, oversized and disallowed files before upload", () => {
    const avatar = getClientFilePolicy("avatar");
    expect(precheckFile(avatar, { name: "me.jpg", size: 1000, type: "image/jpeg" })).toBeNull();
    expect(precheckFile(avatar, { name: "me.jpg", size: 0, type: "image/jpeg" })).toBe("empty");
    expect(precheckFile(avatar, { name: "me.jpg", size: avatar.maxBytes + 1, type: "image/jpeg" })).toBe("too_large");
    expect(precheckFile(avatar, { name: "me.pdf", size: 1000, type: "application/pdf" })).toBe("type_not_allowed");
    expect(precheckFile(avatar, { name: "me.exe", size: 1000, type: "" })).toBe("type_not_allowed");
  });

  it("accepts a known extension even when the browser reports an odd type", () => {
    const ticket = getClientFilePolicy("ticket_attachment");
    expect(precheckFile(ticket, { name: "list.csv", size: 10, type: "application/vnd.ms-excel" })).toBeNull();
  });

  it("extracts lower-case extensions", () => {
    expect(fileExtension("CV.Final.PDF")).toBe("pdf");
    expect(fileExtension(".hidden")).toBe("");
    expect(fileExtension("noext")).toBe("");
    expect(fileExtension("C:\\Users\\me\\photo.JPEG")).toBe("jpeg");
  });
});
