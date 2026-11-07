import "server-only";

import { BlobNotFoundError, del, get, head, put } from "@vercel/blob";

import { isValidStorageKey } from "../keys";
import { StorageError, type StorageDriver, type StoredObject } from "./types";

/**
 * Vercel Blob driver for a PRIVATE store (created with `vercel blob create-store --access private`).
 *
 * - Every object is written with access "private": nothing is reachable by URL without the store
 *   token, so all reads still go through the application's access checks (/api/v1/files/[id] for
 *   private files, /media/[id]/[name] for files the app has marked public).
 * - Storage keys are used verbatim as blob pathnames (no random suffix), so `files.storageKey`
 *   identifies the object; overwrites are allowed so image variants can be regenerated.
 * - Reads bypass the CDN cache (useCache: false) so a replaced or deleted object is never served stale.
 */
export type BlobDriverConfig = { token: string };

function assertKey(key: string): string {
  if (!isValidStorageKey(key)) throw new StorageError(`Invalid storage key: ${key}`);
  return key;
}

function isNotFound(error: unknown): boolean {
  return error instanceof BlobNotFoundError;
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function createBlobDriver(config: BlobDriverConfig): StorageDriver {
  const auth = { token: config.token };

  async function read(key: string): Promise<StoredObject | null> {
    try {
      const result = await get(assertKey(key), { access: "private", useCache: false, ...auth });
      if (!result || result.statusCode !== 200) return null;
      return { body: result.stream, size: result.blob.size };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw new StorageError(`Blob GET ${key} failed`, { cause: error });
    }
  }

  return {
    name: "blob",

    async put(key, data, opts) {
      try {
        await put(assertKey(key), Buffer.from(data), {
          access: "private",
          contentType: opts.contentType,
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 60,
          ...auth,
        });
      } catch (error) {
        throw new StorageError(`Blob PUT ${key} failed`, { cause: error });
      }
    },

    get: read,

    async getBuffer(key) {
      const object = await read(key);
      return object ? streamToBuffer(object.body) : null;
    },

    async head(key) {
      try {
        const meta = await head(assertKey(key), auth);
        return { size: meta.size };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw new StorageError(`Blob HEAD ${key} failed`, { cause: error });
      }
    },

    async delete(key) {
      try {
        await del(assertKey(key), auth);
      } catch (error) {
        if (isNotFound(error)) return;
        throw new StorageError(`Blob DELETE ${key} failed`, { cause: error });
      }
    },
  };
}
