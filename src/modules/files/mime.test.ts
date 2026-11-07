import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { classifyText, decideMimeType, looksLikeText, sniffFileType, type SniffResult } from "./mime";
import { FILE_POLICIES, MIME } from "./policies";

const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#16a6a1" } }).png().toBuffer();
const jpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#101c35" } }).jpeg().toBuffer();
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(510)]);
const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]), Buffer.alloc(100)]);
const cfb = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(1016)]);
const svg = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="url(#g)"/></svg>');
const html = Buffer.from("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>");
const csv = Buffer.from("name,trade\nRavi,Welder\n");

const decide = (sniffed: SniffResult, fileName: string, purpose: keyof typeof FILE_POLICIES, declared: string | null = null) =>
  decideMimeType({ sniffed, fileName, declaredMimeType: declared, allowed: FILE_POLICIES[purpose].allowedMimeTypes, trusted: FILE_POLICIES[purpose].trusted });

describe("sniffFileType", () => {
  it("detects binary formats from magic bytes", async () => {
    expect(await sniffFileType(png)).toEqual({ kind: "binary", mime: "image/png", ext: "png" });
    expect(await sniffFileType(jpeg)).toMatchObject({ kind: "binary", mime: "image/jpeg" });
    expect(await sniffFileType(pdf)).toMatchObject({ kind: "binary", mime: "application/pdf" });
    expect(await sniffFileType(exe)).toMatchObject({ kind: "binary", mime: "application/x-msdownload" });
    expect(await sniffFileType(elf)).toMatchObject({ kind: "binary", mime: "application/x-elf" });
    expect(await sniffFileType(cfb)).toMatchObject({ kind: "binary", mime: "application/x-cfb" });
  });

  it("classifies text formats without magic numbers", async () => {
    expect(await sniffFileType(svg)).toEqual({ kind: "text", mime: "image/svg+xml" });
    expect(await sniffFileType(html)).toEqual({ kind: "text", mime: "text/html" });
    expect(await sniffFileType(csv)).toEqual({ kind: "text", mime: "text/plain" });
    expect(await sniffFileType(Buffer.from("#!/bin/sh\nrm -rf /\n"))).toEqual({ kind: "text", mime: "text/x-script" });
    expect(await sniffFileType(Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]))).toEqual({ kind: "unknown" });
  });

  it("recognises text vs binary and HTML disguises", () => {
    expect(looksLikeText(Buffer.from("plain ascii"))).toBe(true);
    expect(looksLikeText(Buffer.from([0x61, 0x00, 0x62]))).toBe(false);
    expect(looksLikeText(Buffer.from([0xc3, 0x28]))).toBe(false);
    expect(classifyText("  <html><head></head></html>")).toBe("text/html");
    expect(classifyText('<div><img src=x onerror="a()"><script>x</script></div>')).toBe("text/html");
    expect(classifyText('{"a":1}')).toBe("application/json");
    expect(classifyText("<note><to>x</to></note>")).toBe("application/xml");
  });
});

describe("decideMimeType", () => {
  it("accepts matching content, extension and declared type", async () => {
    expect(decide(await sniffFileType(pdf), "cv.pdf", "resume", "application/pdf")).toEqual({ ok: true, mimeType: MIME.pdf, extension: "pdf" });
    expect(decide(await sniffFileType(jpeg), "me.jpeg", "avatar", "image/jpeg")).toMatchObject({ ok: true, mimeType: MIME.jpeg });
    expect(decide(await sniffFileType(png), "logo", "org_logo", "")).toMatchObject({ ok: true, mimeType: MIME.png, extension: "png" });
  });

  it("rejects a file whose extension does not match its content", async () => {
    expect(decide(await sniffFileType(png), "photo.jpg", "avatar", "image/jpeg")).toMatchObject({ ok: false, code: "type_mismatch" });
    expect(decide(await sniffFileType(pdf), "scan.png", "candidate_document")).toMatchObject({ ok: false, code: "type_mismatch" });
  });

  it("rejects a declared type that contradicts the content", async () => {
    expect(decide(await sniffFileType(pdf), "cv.pdf", "resume", "image/png")).toMatchObject({ ok: false, code: "type_mismatch" });
    // Generic declared types are ignored.
    expect(decide(await sniffFileType(pdf), "cv.pdf", "resume", "application/octet-stream")).toMatchObject({ ok: true });
  });

  it("rejects executables and HTML whatever they are called", async () => {
    expect(decide(await sniffFileType(exe), "cv.pdf", "resume")).toMatchObject({ ok: false, code: "dangerous" });
    expect(decide(await sniffFileType(elf), "photo.jpg", "avatar")).toMatchObject({ ok: false, code: "dangerous" });
    expect(decide(await sniffFileType(html), "page.txt", "ticket_attachment")).toMatchObject({ ok: false, code: "dangerous" });
    expect(decide(await sniffFileType(pdf), "invoice.pdf.exe", "resume")).toMatchObject({ ok: false, code: "dangerous" });
    expect(decide(await sniffFileType(Buffer.from("#!/bin/bash\necho hi")), "notes.txt", "ticket_attachment")).toMatchObject({ ok: false, code: "dangerous" });
  });

  it("allows SVG only for trusted purposes", async () => {
    const sniffed = await sniffFileType(svg);
    expect(decide(sniffed, "logo.svg", "org_logo", "image/svg+xml")).toMatchObject({ ok: false, code: "type_not_allowed" });
    expect(decide(sniffed, "icon.svg", "cms_media", "image/svg+xml")).toMatchObject({ ok: true, mimeType: MIME.svg });
  });

  it("treats OLE compound files as Word documents only with a .doc name", async () => {
    const sniffed = await sniffFileType(cfb);
    expect(decide(sniffed, "old-cv.doc", "resume", "application/msword")).toMatchObject({ ok: true, mimeType: MIME.doc });
    expect(decide(sniffed, "setup.msi", "resume")).toMatchObject({ ok: false, code: "dangerous" });
    expect(decide(sniffed, "cv.pdf", "resume")).toMatchObject({ ok: false, code: "dangerous" });
  });

  it("maps plain text to CSV by extension and tolerates odd browser types for CSV", async () => {
    const sniffed = await sniffFileType(csv);
    expect(decide(sniffed, "crew.csv", "ticket_attachment", "application/vnd.ms-excel")).toMatchObject({ ok: true, mimeType: MIME.csv });
    expect(decide(sniffed, "crew.csv", "resume")).toMatchObject({ ok: false, code: "type_not_allowed" });
  });

  it("rejects unknown binary content and types outside the purpose allow-list", async () => {
    expect(decide(await sniffFileType(Buffer.from([0, 1, 2, 3, 250, 251])), "file.bin", "other")).toMatchObject({ ok: false });
    expect(decide(await sniffFileType(pdf), "cv.pdf", "avatar")).toMatchObject({ ok: false, code: "type_not_allowed" });
  });
});
