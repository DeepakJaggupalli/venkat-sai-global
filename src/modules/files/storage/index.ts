import "server-only";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { createLocalDriver } from "./local";
import { createS3Driver } from "./s3";
import { StorageError, type StorageDriver, type StorageDriverName } from "./types";

export type { PresignOptions, StorageDriver, StorageDriverName, StoredObject } from "./types";
export { StorageError } from "./types";

const drivers = new Map<StorageDriverName, StorageDriver>();
let warnedEphemeral = false;

function build(name: StorageDriverName): StorageDriver {
  const e = env();
  if (name === "local") {
    if (!warnedEphemeral && e.NODE_ENV === "production" && process.env.VERCEL) {
      warnedEphemeral = true;
      logger.warn("STORAGE_DRIVER=local on a serverless host: uploaded files will not persist. Use STORAGE_DRIVER=s3.");
    }
    return createLocalDriver(e.STORAGE_LOCAL_DIR);
  }
  if (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) {
    throw new StorageError("S3 storage is not configured: set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (and S3_ENDPOINT for non-AWS services).");
  }
  return createS3Driver({
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    bucket: e.S3_BUCKET,
    accessKeyId: e.S3_ACCESS_KEY_ID,
    secretAccessKey: e.S3_SECRET_ACCESS_KEY,
  });
}

/**
 * Storage driver by name (defaults to STORAGE_DRIVER for new files). Reads must use the driver
 * recorded on the files row, so switching STORAGE_DRIVER later keeps old files readable as long as
 * both drivers stay configured.
 */
export function getStorageDriver(name?: StorageDriverName): StorageDriver {
  const resolved = name ?? env().STORAGE_DRIVER;
  let driver = drivers.get(resolved);
  if (!driver) {
    driver = build(resolved);
    drivers.set(resolved, driver);
  }
  return driver;
}

/** Test hook: replace a driver (e.g. an in-memory fake). */
export function setStorageDriverForTesting(name: StorageDriverName, driver: StorageDriver | null): void {
  if (driver) drivers.set(name, driver);
  else drivers.delete(name);
}
