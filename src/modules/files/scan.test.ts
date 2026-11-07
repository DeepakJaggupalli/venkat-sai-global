import net from "node:net";

import { afterAll, describe, expect, it } from "vitest";

import { parseClamdResponse, scanWithClamd } from "./scan";

/** Minimal clamd INSTREAM server: validates the framing and flags payloads containing "EICAR". */
function startFakeClamd(behaviour: "verdict" | "silent" = "verdict"): Promise<{ port: number; close: () => Promise<void>; received: Buffer[] }> {
  const received: Buffer[] = [];
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let commandRead = false;
    const chunks: Buffer[] = [];
    socket.on("data", (data) => {
      buffer = Buffer.concat([buffer, data]);
      if (!commandRead) {
        const nul = buffer.indexOf(0);
        if (nul === -1) return;
        const command = buffer.subarray(0, nul).toString("ascii");
        if (command !== "zINSTREAM") {
          socket.end("UNKNOWN COMMAND\0");
          return;
        }
        commandRead = true;
        buffer = buffer.subarray(nul + 1);
      }
      while (buffer.length >= 4) {
        const size = buffer.readUInt32BE(0);
        if (size === 0) {
          const payload = Buffer.concat(chunks);
          received.push(payload);
          if (behaviour === "silent") return;
          socket.end(payload.includes("EICAR") ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
          return;
        }
        if (buffer.length < 4 + size) return;
        chunks.push(buffer.subarray(4, 4 + size));
        buffer = buffer.subarray(4 + size);
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, received, close: () => new Promise<void>((r) => server.close(() => r())) });
    });
  });
}

describe("parseClamdResponse", () => {
  it("parses clean, infected and error replies", () => {
    expect(parseClamdResponse("stream: OK\0")).toEqual({ status: "clean" });
    expect(parseClamdResponse("stream: Win.Test.EICAR_HDB-1 FOUND\0")).toEqual({ status: "infected", signature: "Win.Test.EICAR_HDB-1" });
    expect(parseClamdResponse("INSTREAM size limit exceeded. ERROR\0")).toMatchObject({ status: "error" });
    expect(parseClamdResponse("")).toMatchObject({ status: "error" });
    expect(parseClamdResponse("garbage")).toMatchObject({ status: "error" });
  });
});

describe("scanWithClamd (INSTREAM over TCP)", async () => {
  const clamd = await startFakeClamd();
  afterAll(() => clamd.close());

  it("streams the whole payload in framed chunks and reports clean files", async () => {
    const data = Buffer.alloc(200_000, 7);
    const outcome = await scanWithClamd(data, { host: "127.0.0.1", port: clamd.port, chunkSize: 16 * 1024 });
    expect(outcome).toEqual({ status: "clean" });
    expect(clamd.received.at(-1)?.equals(data)).toBe(true);
  });

  it("reports infected files with the signature", async () => {
    const outcome = await scanWithClamd(Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"), { host: "127.0.0.1", port: clamd.port });
    expect(outcome).toEqual({ status: "infected", signature: "Eicar-Test-Signature" });
  });

  it("returns an error (never throws) when the daemon is unreachable", async () => {
    const closed = await startFakeClamd();
    await closed.close();
    const outcome = await scanWithClamd(Buffer.from("x"), { host: "127.0.0.1", port: closed.port, timeoutMs: 2000 });
    expect(outcome.status).toBe("error");
  });

  it("times out when the daemon never answers", async () => {
    const silent = await startFakeClamd("silent");
    const outcome = await scanWithClamd(Buffer.from("x"), { host: "127.0.0.1", port: silent.port, timeoutMs: 500 });
    expect(outcome).toMatchObject({ status: "error" });
    await silent.close();
  });
});
