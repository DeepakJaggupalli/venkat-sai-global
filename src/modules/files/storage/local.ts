import "server-only";

import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { isValidStorageKey } from "../keys";
import { StorageError, type StorageDriver, type StoredObject } from "./types";

/**
 * Local disk driver: objects are files under STORAGE_LOCAL_DIR (default ./storage, outside
 * /public so nothing is ever served without the access check). Writes are atomic (temp file +
 * rename). Suitable for a single VM / App Service with a persistent disk — not for serverless
 * hosts, whose file systems are ephemeral (use the S3 driver there).
 */
export function createLocalDriver(rootDir: string): StorageDriver {
  const root = path.resolve(rootDir);

  function resolveKey(key: string): string {
    if (!isValidStorageKey(key)) throw new StorageError(`Invalid storage key: ${key}`);
    const full = path.resolve(root, ...key.split("/"));
    if (!full.startsWith(root + path.sep)) throw new StorageError("Storage key escapes the storage root");
    return full;
  }

  return {
    name: "local",

    async put(key, data) {
      const target = resolveKey(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temp = `${target}.tmp-${randomBytes(6).toString("hex")}`;
      try {
        await fs.writeFile(temp, data, { flag: "wx" });
        await fs.rename(temp, target);
      } catch (error) {
        await fs.rm(temp, { force: true }).catch(() => undefined);
        throw new StorageError(`Failed to write ${key}`, { cause: error });
      }
    },

    async get(key): Promise<StoredObject | null> {
      const target = resolveKey(key);
      try {
        const stat = await fs.stat(target);
        if (!stat.isFile()) return null;
        const stream = createReadStream(target);
        return { body: Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, size: stat.size };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new StorageError(`Failed to read ${key}`, { cause: error });
      }
    },

    async getBuffer(key) {
      const target = resolveKey(key);
      try {
        return await fs.readFile(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new StorageError(`Failed to read ${key}`, { cause: error });
      }
    },

    async head(key) {
      const target = resolveKey(key);
      try {
        const stat = await fs.stat(target);
        return stat.isFile() ? { size: stat.size } : null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new StorageError(`Failed to stat ${key}`, { cause: error });
      }
    },

    async delete(key) {
      const target = resolveKey(key);
      try {
        await fs.rm(target, { force: true });
      } catch (error) {
        throw new StorageError(`Failed to delete ${key}`, { cause: error });
      }
    },
  };
}
