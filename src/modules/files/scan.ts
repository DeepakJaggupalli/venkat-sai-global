import "server-only";

import net from "node:net";

import { env } from "@/lib/env";

/**
 * Malware scanning through a ClamAV daemon (clamd) using the INSTREAM command over TCP.
 * Enabled when CLAMAV_HOST is set; otherwise uploads are stored with scanStatus "not_scanned".
 *
 * Protocol: "zINSTREAM\0", then chunks framed as <uint32 big-endian length><bytes>, terminated by a
 * zero-length chunk. clamd answers "stream: OK", "stream: <signature> FOUND" or "<reason> ERROR".
 * clamd's StreamMaxLength must be at least the largest per-purpose upload limit (see OPERATIONS.md).
 */

export type ScanOutcome = { status: "clean" } | { status: "infected"; signature: string } | { status: "error"; detail: string };

export function isMalwareScanningEnabled(): boolean {
  return Boolean(env().CLAMAV_HOST);
}

/** Parse a clamd reply (trailing NUL / newline tolerated). */
export function parseClamdResponse(raw: string): ScanOutcome {
  const reply = raw.replace(/\0/g, "").trim();
  if (!reply) return { status: "error", detail: "Empty reply from ClamAV" };
  const body = reply.replace(/^stream:\s*/i, "").replace(/^\d+:\s*stream:\s*/i, "");
  if (/^OK$/i.test(body)) return { status: "clean" };
  const found = /^(.*)\s+FOUND$/i.exec(body);
  if (found) return { status: "infected", signature: (found[1] ?? "unknown").trim().slice(0, 200) || "unknown" };
  if (/ERROR$/i.test(body)) return { status: "error", detail: body.slice(0, 300) };
  return { status: "error", detail: `Unexpected reply from ClamAV: ${body.slice(0, 200)}` };
}

export type ClamdOptions = {
  host: string;
  port: number;
  /** Whole-operation timeout (connect + stream + verdict). */
  timeoutMs?: number;
  chunkSize?: number;
};

/** Stream a buffer to clamd and return its verdict. Never throws. */
export function scanWithClamd(data: Uint8Array, opts: ClamdOptions): Promise<ScanOutcome> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const chunkSize = Math.max(1024, opts.chunkSize ?? 64 * 1024);

  return new Promise<ScanOutcome>((resolve) => {
    let settled = false;
    let reply = "";
    const socket = net.createConnection({ host: opts.host, port: opts.port });

    const finish = (outcome: ScanOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(outcome);
    };

    const timer = setTimeout(() => finish({ status: "error", detail: `ClamAV did not answer within ${timeoutMs} ms` }), timeoutMs);

    const write = (buf: Uint8Array): Promise<void> =>
      new Promise((res, rej) => {
        if (settled) return rej(new Error("closed"));
        const ok = socket.write(buf, (err) => (err ? rej(err) : undefined));
        if (ok) return res();
        const onDrain = () => {
          socket.off("close", onClose);
          res();
        };
        const onClose = () => {
          socket.off("drain", onDrain);
          rej(new Error("closed"));
        };
        socket.once("drain", onDrain);
        socket.once("close", onClose);
      });

    socket.setNoDelay(true);
    socket.on("error", (err) => finish({ status: "error", detail: `ClamAV connection failed: ${err.message}` }));
    socket.on("data", (chunk: Buffer) => {
      reply += chunk.toString("utf8");
      if (reply.includes("\0") || reply.includes("\n")) finish(parseClamdResponse(reply));
    });
    socket.on("end", () => finish(parseClamdResponse(reply)));
    socket.on("close", () => finish(reply ? parseClamdResponse(reply) : { status: "error", detail: "ClamAV closed the connection without a verdict" }));

    socket.on("connect", () => {
      void (async () => {
        try {
          await write(Buffer.from("zINSTREAM\0", "ascii"));
          for (let offset = 0; offset < data.byteLength; offset += chunkSize) {
            const chunk = data.subarray(offset, Math.min(offset + chunkSize, data.byteLength));
            const header = Buffer.alloc(4);
            header.writeUInt32BE(chunk.byteLength, 0);
            await write(header);
            await write(chunk);
          }
          await write(Buffer.alloc(4)); // zero-length chunk = end of stream
        } catch (err) {
          // clamd may close early (e.g. size limit exceeded) after sending its verdict.
          if (!reply) finish({ status: "error", detail: `Failed to stream file to ClamAV: ${err instanceof Error ? err.message : String(err)}` });
        }
      })();
    });
  });
}

/** Scan with the configured daemon; null when scanning is not configured. */
export async function scanBuffer(data: Uint8Array): Promise<ScanOutcome | null> {
  const { CLAMAV_HOST, CLAMAV_PORT } = env();
  if (!CLAMAV_HOST) return null;
  return scanWithClamd(data, { host: CLAMAV_HOST, port: CLAMAV_PORT });
}
