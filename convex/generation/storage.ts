"use node";

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "./runtime";

export function uniqueStorageToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

function r2Config(required: true): R2Config;
function r2Config(required?: false): R2Config | null;
function r2Config(required = false): R2Config | null {
  const accountId = env("R2_ACCOUNT_ID");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET");
  const publicBaseUrl = env("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  if (accountId && accessKeyId && secretAccessKey && bucket && publicBaseUrl) {
    return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
  }
  if (!required) return null;
  throw new Error(
    "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL are required.",
  );
}

function r2Client(config: R2Config) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function uploadToR2(args: {
  bytes: Buffer;
  key: string;
  contentType: string;
}) {
  const config = r2Config(true);
  const client = r2Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: args.key,
      Body: args.bytes,
      ContentType: args.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `${config.publicBaseUrl}/${args.key}`;
}

export async function deleteKeyFromR2(key: string) {
  const config = r2Config();
  if (!config) return;
  const normalizedKey = key.replace(/^\/+/, "");
  if (!normalizedKey) return;
  await r2Client(config).send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: normalizedKey }),
  );
}

export async function deleteR2ObjectsWithPrefix(args: {
  prefix: string;
  olderThanMs?: number;
  limit?: number;
}) {
  const config = r2Config();
  if (!config) return { deleted: 0, hasMore: false, configured: false };
  const client = r2Client(config);
  const cutoff = args.olderThanMs
    ? new Date(Date.now() - args.olderThanMs)
    : null;
  const limit = Math.max(1, args.limit ?? 500);
  let deleted = 0;
  let hasMore = false;
  let continuationToken: string | undefined;
  do {
    const remaining = limit - deleted;
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: args.prefix,
        ContinuationToken: continuationToken,
        MaxKeys: Math.min(remaining, 1000),
      }),
    );
    const keys = (result.Contents ?? []).flatMap((object) => {
      if (!object.Key) return [];
      if (cutoff && (!object.LastModified || object.LastModified > cutoff)) {
        return [];
      }
      return [{ Key: object.Key }];
    });
    if (keys.length) {
      const deletion = await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: { Objects: keys, Quiet: true },
        }),
      );
      if (deletion.Errors?.length) {
        throw new Error(
          `R2 bulk deletion failed for ${deletion.Errors.length} object(s).`,
        );
      }
      deleted += keys.length;
    }
    if (deleted >= limit) {
      hasMore = Boolean(result.IsTruncated);
      continuationToken = undefined;
    } else {
      continuationToken = result.IsTruncated
        ? result.NextContinuationToken
        : undefined;
    }
  } while (continuationToken);
  return { deleted, hasMore, configured: true };
}

export async function deleteFromR2(storageUrl: string) {
  const config = r2Config();
  if (!config) return;
  if (!storageUrl.startsWith(`${config.publicBaseUrl}/`)) return;
  await deleteKeyFromR2(storageUrl.slice(config.publicBaseUrl.length + 1));
}
