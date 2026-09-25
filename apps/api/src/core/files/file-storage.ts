/**
 * Where files are kept (D24): a private S3-compatible bucket, behind one
 * interface, the way text messages sit behind their providers. The bucket in
 * production; memory in tests; and, where no bucket is set up, nothing, which
 * the service turns into a plain refusal.
 */
export type UploadPolicy = {
  /** Where the browser posts the file, with these form fields before it. */
  url: string;
  fields: Record<string, string>;
  /** The largest file the bucket itself will take, in bytes. */
  maxBytes: number;
  contentType: string;
  expiresAt: string;
};

export type StoredObject = { key: string; bytes: number; contentType: string; modifiedAt: Date };

export interface FileStorage {
  /**
   * A presigned POST: the browser uploads straight to the bucket, and the
   * bucket itself refuses anything but this type and anything over this size.
   * A large file never passes through the API.
   */
  uploadPolicy(
    key: string,
    rules: { contentType: string; maxBytes: number; expiresSeconds: number },
  ): Promise<UploadPolicy>;
  /** What is there under this key, or null. */
  head(key: string): Promise<StoredObject | null>;
  /** A link that works for this long and then stops. */
  downloadUrl(key: string, rules: { filename: string; expiresSeconds: number }): Promise<string>;
  /** Everything under a prefix, for the nightly check. */
  list(prefix: string): Promise<StoredObject[]>;
  delete(key: string): Promise<void>;
  /** The first bytes, to check a file is what it says it is. */
  firstBytes(key: string, count: number): Promise<Buffer>;
}
