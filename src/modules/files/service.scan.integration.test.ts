/**
 * Malware-scanning path of the storage pipeline against a fake clamd (INSTREAM over TCP).
 * Runs only against an isolated test database (DATABASE_URL containing "vsg_test_").
 */
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const enabled = /vsg_test_/.test(process.env.DATABASE_URL ?? "");
const STORAGE_DIR = path.resolve(path.join(process.cwd(), "..", "VenkatSaiGlobal-work", "infra", "storage-scan-test"));

/** Fake clamd: "up" answers verdicts (payloads containing EICAR are infected); "down" drops connections. */
async function fakeClamd() {
  const state = { mode: "up" as "up" | "down" };
  const server = net.createServer((socket) => {
    if (state.mode === "down") {
      socket.destroy();
      return;
    }
    let buf = Buffer.alloc(0);
    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.length >= 4 && buf.subarray(buf.length - 4).equals(Buffer.alloc(4))) {
        socket.end(buf.includes("EICAR") ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { state, port: (server.address() as net.AddressInfo).port, close: () => new Promise<void>((r) => server.close(() => r())) };
}

describe.skipIf(!enabled)("files service with ClamAV scanning", async () => {
  if (!enabled) {
    it("needs DATABASE_URL pointing to a vsg_test_* database", () => undefined);
    return;
  }
  const clamd = await fakeClamd();
  Object.assign(process.env, { STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: STORAGE_DIR, CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(clamd.port) });

  const { eq, sql } = await import("drizzle-orm");
  const { db, pool } = await import("@/db");
  const { files, securityEvents, users } = await import("@/db/schema");
  const service = await import("./service");
  const { checkFileAccess, loadFileViewer } = await import("./access");

  const [owner] = await db.insert(users).values({ displayName: "Scan owner (test)", email: `scan-${Date.now()}@vsg-test.invalid` }).returning({ id: users.id });
  const ownerId = owner!.id;

  afterAll(async () => {
    await db.execute(sql`delete from background_jobs where type like 'files.%'`);
    await db.execute(sql`delete from security_events where user_id = ${ownerId}`);
    await db.execute(sql`delete from files where owner_user_id = ${ownerId}`);
    await db.execute(sql`delete from users where id = ${ownerId}`);
    await pool.end();
    await clamd.close();
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
  });

  const pdf = (body: string) => Buffer.from(`%PDF-1.4\n${body}\n%%EOF\n`);

  it("marks clean uploads as scanned", async () => {
    const row = await service.storeFile({ data: pdf("clean"), originalName: "cv.pdf", purpose: "resume", ownerUserId: ownerId });
    expect(row.scanStatus).toBe("clean");
    expect(row.scannedAt).toBeInstanceOf(Date);
  });

  it("quarantines infected uploads: rejected, recorded, never served", async () => {
    const data = pdf("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
    await expect(service.storeFile({ data, originalName: "invoice.pdf", purpose: "resume", ownerUserId: ownerId })).rejects.toMatchObject({ code: "infected", status: 422 });
    const [row] = await db.select().from(files).where(eq(files.ownerUserId, ownerId)).orderBy(sql`${files.createdAt} desc`).limit(1);
    expect(row).toMatchObject({ scanStatus: "infected", scanDetail: "Eicar-Test-Signature" });
    const events = await db.select().from(securityEvents).where(eq(securityEvents.userId, ownerId));
    expect(events.some((e) => e.type === "file_quarantined")).toBe(true);
    expect(await checkFileAccess(await loadFileViewer(ownerId), row!)).toEqual({ allowed: false, reason: "quarantined" });
  });

  it("defers the scan when ClamAV is unavailable and completes it in the background task", async () => {
    clamd.state.mode = "down";
    const row = await service.storeFile({ data: pdf("later"), originalName: "letter.pdf", purpose: "candidate_document", ownerUserId: ownerId });
    expect(row.scanStatus).toBe("pending");
    const tasks = await db.execute<{ type: string }>(sql`select type from background_jobs where dedupe_key = ${`files.process:${row.id}`}`);
    expect(tasks.rows).toHaveLength(1);
    // Not servable to others while pending; the owner can still open it.
    expect(await checkFileAccess(await loadFileViewer(ownerId), row)).toMatchObject({ allowed: true, via: "owner" });

    await expect(service.processStoredFile(row.id)).rejects.toThrow(/Malware scan failed/);
    expect((await db.select().from(files).where(eq(files.id, row.id)))[0]!.scanStatus).toBe("error");

    clamd.state.mode = "up";
    expect(await service.processStoredFile(row.id)).toBe("processed");
    expect((await db.select().from(files).where(eq(files.id, row.id)))[0]!.scanStatus).toBe("clean");
  });
});
