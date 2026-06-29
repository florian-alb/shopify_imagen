"use node";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "./runtime";

export function uniqueStorageToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function uploadToR2(args: {
  bytes: Buffer;
  key: string;
  contentType: string;
}) {
  const accountId = env("R2_ACCOUNT_ID");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET");
  const publicBaseUrl = env("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBaseUrl
  ) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL are required.",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: args.key,
      Body: args.bytes,
      ContentType: args.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `${publicBaseUrl}/${args.key}`;
}

export async function deleteFromR2(storageUrl: string) {
  const accountId = env("R2_ACCOUNT_ID");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET");
  const publicBaseUrl = env("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBaseUrl
  )
    return;
  if (!storageUrl.startsWith(`${publicBaseUrl}/`)) return;
  const key = storageUrl.slice(publicBaseUrl.length + 1);
  if (!key) return;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
