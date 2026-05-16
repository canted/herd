import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface TigrisStorageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface PackageObjectKeyInput {
  ownerEmail: string;
  packageId: string;
  version: number;
  filename?: string;
}

export function loadTigrisStorageConfig(env: NodeJS.ProcessEnv = process.env): TigrisStorageConfig | null {
  const endpoint = env.TIGRIS_ENDPOINT;
  const bucket = env.TIGRIS_BUCKET;
  const accessKeyId = env.TIGRIS_ACCESS_KEY_ID;
  const secretAccessKey = env.TIGRIS_SECRET_ACCESS_KEY;
  const region = env.TIGRIS_REGION ?? "auto";

  if (
    endpoint === undefined ||
    bucket === undefined ||
    accessKeyId === undefined ||
    secretAccessKey === undefined
  ) {
    return null;
  }

  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
  };
}

export function buildPackageObjectKey(input: PackageObjectKeyInput): string {
  const ownerKey = createHash("sha256").update(input.ownerEmail.trim().toLowerCase()).digest("hex").slice(0, 20);
  const filename = sanitizePathSegment(input.filename ?? "package.herd.zip");
  return `users/${ownerKey}/packages/${sanitizePathSegment(input.packageId)}/versions/${input.version}/${filename}`;
}

export async function createPackageUploadUrl({
  config,
  objectKey,
  contentType = "application/zip",
  expiresInSeconds = 900,
}: {
  config: TigrisStorageConfig;
  objectKey: string;
  contentType?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: false,
  });

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ContentType: contentType,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function createPackageDownloadUrl({
  config,
  objectKey,
  expiresInSeconds = 900,
}: {
  config: TigrisStorageConfig;
  objectKey: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const client = createS3Client(config);

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    }),
    { expiresIn: expiresInSeconds },
  );
}

function createS3Client(config: TigrisStorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: false,
  });
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "");
  return sanitized.length === 0 ? "unnamed" : sanitized;
}
