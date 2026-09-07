import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface StorageConfig {
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}

function readConfig(): StorageConfig | null {
    const endpoint = process.env.RECEIPTS_S3_ENDPOINT;
    const bucket = process.env.RECEIPTS_S3_BUCKET;
    const accessKeyId = process.env.RECEIPTS_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.RECEIPTS_S3_SECRET_ACCESS_KEY;
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
    return {
        endpoint,
        bucket,
        accessKeyId,
        secretAccessKey,
        region: process.env.RECEIPTS_S3_REGION || "auto",
    };
}

let cached: { client: S3Client; bucket: string } | undefined;

function getStorage() {
    if (cached) return cached;
    const config = readConfig();
    if (!config) throw new Error("Receipt storage is not configured");
    cached = {
        bucket: config.bucket,
        client: new S3Client({
            endpoint: config.endpoint,
            region: config.region,
            forcePathStyle: true,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        }),
    };
    return cached;
}

export function isStorageConfigured() {
    return readConfig() !== null;
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
    const { client, bucket } = getStorage();
    await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
    );
}

export async function deleteObject(key: string) {
    const { client, bucket } = getStorage();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getSignedDownloadUrl(key: string, expiresSeconds = 300) {
    const { client, bucket } = getStorage();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: expiresSeconds,
    });
}
