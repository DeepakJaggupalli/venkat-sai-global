import "server-only";

import { AwsClient } from "aws4fetch";

import { isValidStorageKey } from "../keys";
import { StorageError, type StorageDriver, type StoredObject } from "./types";

/**
 * S3-compatible driver (AWS S3, Cloudflare R2, MinIO, Backblaze B2, Wasabi...) using SigV4 via
 * aws4fetch — no SDK. With S3_ENDPOINT set, path-style URLs are used (`<endpoint>/<bucket>/<key>`),
 * which every S3-compatible service supports; without it, AWS virtual-hosted URLs.
 * Keep the bucket PRIVATE: all reads go through the application's access checks (or short-lived
 * presigned URLs issued after them).
 */
export type S3DriverConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Per-request timeout (ms). */
  timeoutMs?: number;
};

export function createS3Driver(config: S3DriverConfig): StorageDriver {
  const timeoutMs = config.timeoutMs ?? 30_000;
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region || "auto",
    retries: 2,
  });

  const base = config.endpoint
    ? `${config.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(config.bucket)}`
    : `https://${config.bucket}.s3.${config.region}.amazonaws.com`;

  function objectUrl(key: string): string {
    if (!isValidStorageKey(key)) throw new StorageError(`Invalid storage key: ${key}`);
    return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async function send(key: string, init: RequestInit): Promise<Response> {
    try {
      return await client.fetch(objectUrl(key), { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new StorageError(`S3 request failed for ${key}`, { cause: error });
    }
  }

  async function failure(res: Response, action: string, key: string): Promise<StorageError> {
    const text = await res.text().catch(() => "");
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
    return new StorageError(`S3 ${action} ${key} failed: HTTP ${res.status}${code ? ` (${code})` : ""}`);
  }

  return {
    name: "s3",

    async put(key, data, opts) {
      const res = await send(key, {
        method: "PUT",
        body: data as unknown as BodyInit,
        headers: { "content-type": opts.contentType },
      });
      if (!res.ok) throw await failure(res, "PUT", key);
      await res.body?.cancel().catch(() => undefined);
    },

    async get(key): Promise<StoredObject | null> {
      const res = await send(key, { method: "GET" });
      if (res.status === 404) {
        await res.body?.cancel().catch(() => undefined);
        return null;
      }
      if (!res.ok || !res.body) throw await failure(res, "GET", key);
      const length = Number(res.headers.get("content-length"));
      return { body: res.body as ReadableStream<Uint8Array>, size: Number.isFinite(length) && length >= 0 ? length : null };
    },

    async getBuffer(key) {
      const res = await send(key, { method: "GET" });
      if (res.status === 404) {
        await res.body?.cancel().catch(() => undefined);
        return null;
      }
      if (!res.ok) throw await failure(res, "GET", key);
      return Buffer.from(await res.arrayBuffer());
    },

    async head(key) {
      const res = await send(key, { method: "HEAD" });
      if (res.status === 404) return null;
      if (!res.ok) throw await failure(res, "HEAD", key);
      const length = Number(res.headers.get("content-length"));
      return { size: Number.isFinite(length) ? length : 0 };
    },

    async delete(key) {
      const res = await send(key, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw await failure(res, "DELETE", key);
      await res.body?.cancel().catch(() => undefined);
    },

    async presignGet(key, opts) {
      const url = new URL(objectUrl(key));
      url.searchParams.set("X-Amz-Expires", String(Math.max(1, Math.min(opts.expiresInSeconds, 7 * 24 * 3600))));
      if (opts.contentType) url.searchParams.set("response-content-type", opts.contentType);
      if (opts.contentDisposition) url.searchParams.set("response-content-disposition", opts.contentDisposition);
      if (opts.cacheControl) url.searchParams.set("response-cache-control", opts.cacheControl);
      const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
      return signed.url;
    },
  };
}
