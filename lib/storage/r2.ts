import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 client. Free tier: 10 GB storage, $0 egress.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID         — Cloudflare account ID
 *   R2_ACCESS_KEY_ID      — R2 API token access key
 *   R2_SECRET_ACCESS_KEY  — R2 API token secret
 *   R2_BUCKET             — bucket name
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

let cached: { client: S3Client; bucket: string } | null = null;

function getClient(): { client: S3Client; bucket: string } {
  if (cached) return cached;
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const bucket = requireEnv("R2_BUCKET");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  cached = { client, bucket };
  return cached;
}

export type UploadParams = {
  key: string;
  contentType: string;
  contentLengthMax?: number;
  ttlSeconds?: number;
};

/**
 * Returns a presigned URL for a browser to PUT an object directly. The
 * browser must include the same Content-Type header on the request.
 */
export async function getSignedPutUrl(p: UploadParams): Promise<string> {
  const { client, bucket } = getClient();
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: p.key,
    ContentType: p.contentType,
    ContentLength: p.contentLengthMax,
  });
  return getSignedUrl(client, cmd, { expiresIn: p.ttlSeconds ?? 300 });
}

export async function getSignedGetObjectUrl(
  key: string,
  ttlSeconds = 300,
): Promise<string> {
  const { client, bucket } = getClient();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, cmd, { expiresIn: ttlSeconds });
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const { client, bucket } = getClient();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`empty object body for ${key}`);
  return res.Body.transformToByteArray();
}

export async function putObjectBytes(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Build a stable storage key. Layout: `u/<userId>/<kind>/<yyyy>/<mm>/<uuid>.<ext>`.
 */
export function buildStorageKey(args: {
  userId: string;
  kind: string;
  filename: string;
  uuid: string;
}): string {
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dot = args.filename.lastIndexOf(".");
  const ext = dot >= 0 ? args.filename.slice(dot + 1).toLowerCase() : "bin";
  return `u/${args.userId}/${args.kind}/${yyyy}/${mm}/${args.uuid}.${ext}`;
}
