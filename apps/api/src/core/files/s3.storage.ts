import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FileStorage, StoredObject, UploadPolicy } from './file-storage.js';

export type S3Settings = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
};

/**
 * Cloudflare R2 or Backblaze B2, through the S3 protocol both speak. The code
 * does not care which; the endpoint and region say.
 */
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;

  constructor(private readonly settings: S3Settings) {
    this.client = new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      credentials: { accessKeyId: settings.accessKey, secretAccessKey: settings.secretKey },
      // Neither R2 nor B2 serves buckets as subdomains of the endpoint.
      forcePathStyle: true,
    });
  }

  async uploadPolicy(
    key: string,
    rules: { contentType: string; maxBytes: number; expiresSeconds: number },
  ): Promise<UploadPolicy> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.settings.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, rules.maxBytes],
        ['eq', '$Content-Type', rules.contentType],
      ],
      Fields: { 'Content-Type': rules.contentType },
      Expires: rules.expiresSeconds,
    });
    return {
      url,
      fields,
      maxBytes: rules.maxBytes,
      contentType: rules.contentType,
      expiresAt: new Date(Date.now() + rules.expiresSeconds * 1000).toISOString(),
    };
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.settings.bucket, Key: key }),
      );
      return {
        key,
        bytes: res.ContentLength ?? 0,
        contentType: res.ContentType ?? '',
        modifiedAt: res.LastModified ?? new Date(0),
      };
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  downloadUrl(key: string, rules: { filename: string; expiresSeconds: number }) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
        ResponseContentDisposition: `inline; filename="${rules.filename.replace(/["\\\r\n]/g, '')}"`,
      }),
      { expiresIn: rules.expiresSeconds },
    );
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const out: StoredObject[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.settings.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const o of page.Contents ?? []) {
        if (!o.Key) continue;
        out.push({
          key: o.Key,
          bytes: o.Size ?? 0,
          contentType: '',
          modifiedAt: o.LastModified ?? new Date(0),
        });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }));
  }

  async firstBytes(key: string, count: number): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
        Range: `bytes=0-${count - 1}`,
      }),
    );
    return Buffer.from((await res.Body?.transformToByteArray()) ?? []);
  }
}
