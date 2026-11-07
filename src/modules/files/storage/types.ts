/**
 * Storage driver contract. Bytes live in a driver; the `files` row records which driver and key.
 * Keys are produced by generateStorageKey()/variantStorageKey() only.
 */
export type StorageDriverName = "local" | "s3" | "blob";

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  /** Byte length when known. */
  size: number | null;
};

export type PresignOptions = {
  expiresInSeconds: number;
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
};

export interface StorageDriver {
  readonly name: StorageDriverName;
  /** Write (or overwrite) an object. */
  put(key: string, data: Uint8Array, opts: { contentType: string }): Promise<void>;
  /** Stream an object, or null when it does not exist. */
  get(key: string): Promise<StoredObject | null>;
  /** Read a whole object into memory (background processing), or null when missing. */
  getBuffer(key: string): Promise<Buffer | null>;
  head(key: string): Promise<{ size: number } | null>;
  /** Delete an object; missing objects are not an error. */
  delete(key: string): Promise<void>;
  /** Short-lived signed GET URL (S3 only). */
  presignGet?(key: string, opts: PresignOptions): Promise<string>;
}

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
  }
}
