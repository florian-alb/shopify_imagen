"use node"

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  ListPartsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { AsyncLocalStorage } from "node:async_hooks"

const writes = new AsyncLocalStorage<{ root: string; generation: number }>()
export function withCatalogWrites<T>(
  root: string,
  generation: number,
  run: () => Promise<T>,
) {
  return writes.run({ root, generation }, run)
}

function config() {
  const account = process.env.R2_ACCOUNT_ID
  const bucket = process.env.CATALOG_R2_BUCKET
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!account || !bucket || !accessKeyId || !secretAccessKey)
    throw new Error(
      "Configurez CATALOG_R2_BUCKET (privé) et les identifiants R2.",
    )
  if (bucket === process.env.R2_BUCKET)
    throw new Error(
      "Le bucket des catalogues doit être distinct du bucket public des images.",
    )
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  }
}
export function rootKey(owner: string, operation: string) {
  return `catalog-exports/${owner}/${operation}`
}
export async function putText(
  key: string,
  body: string,
  contentType = "application/json",
) {
  const { client, bucket } = config()
  const fence = writes.getStore()
  let etag: string | undefined
  if (fence) {
    if (!key.startsWith(`${fence.root}/`))
      throw new Error("Écriture hors de l’opération catalogue.")
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      )
      if (Number(head.Metadata?.generation ?? 0) > fence.generation)
        throw new Error("Tentative remplacée par une reprise plus récente.")
      etag = head.ETag
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          ["NotFound", "NoSuchKey"].includes(error.name)
        )
      )
        throw error
    }
  }
  await client.send(
    new PutObjectCommand({
      // Legal trailing whitespace makes the ETag change across generations even for identical data.
      Bucket: bucket,
      Key: key,
      Body: fence
        ? `${body}\n${fence.generation.toString(2).replace(/0/g, " ").replace(/1/g, "\t")}`
        : body,
      ContentType: contentType,
      CacheControl: "private, no-store",
      ...(fence
        ? {
            Metadata: { generation: String(fence.generation) },
            ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }),
          }
        : {}),
    }),
  )
}
export async function putJson(key: string, value: unknown) {
  await putText(key, JSON.stringify(value))
}
export async function getText(key: string): Promise<string | null> {
  const { client, bucket } = config()
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    )
    if ((response.ContentLength ?? 0) > 32 * 1024 * 1024)
      throw new Error("Objet R2 trop volumineux pour une lecture unitaire.")
    return await response.Body!.transformToString()
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NoSuchKey" || error.name === "NotFound")
    )
      return null
    throw error
  }
}
export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await getText(key)
  return raw === null ? null : (JSON.parse(raw) as T)
}
export async function listKeys(prefix: string, cursor?: string, limit = 100) {
  const { client, bucket } = config()
  const r = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: cursor,
      MaxKeys: Math.min(1000, limit),
    }),
  )
  return {
    keys: (r.Contents ?? []).flatMap((v) => (v.Key ? [v.Key] : [])),
    cursor: r.IsTruncated ? r.NextContinuationToken : undefined,
  }
}
export async function downloadUrl(key: string) {
  const { client, bucket } = config()
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition:
        'attachment; filename="catalogue-shopify.json"',
    }),
    { expiresIn: 300 },
  )
}
export async function startMultipart(key: string) {
  const { client, bucket } = config()
  const r = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: "application/json",
      CacheControl: "private, no-store",
    }),
  )
  return r.UploadId!
}
export async function uploadPart(
  key: string,
  uploadId: string,
  part: number,
  body: string,
) {
  const { client, bucket } = config()
  await client.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: part,
      Body: body,
    }),
  )
}
export async function finishMultipart(key: string, uploadId: string) {
  const { client, bucket } = config()
  const parts: Array<{ ETag: string; PartNumber: number }> = []
  let marker: string | undefined
  do {
    const r = await client.send(
      new ListPartsCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: marker,
      }),
    )
    parts.push(
      ...(r.Parts ?? []).map((p) => ({
        ETag: p.ETag!,
        PartNumber: p.PartNumber!,
      })),
    )
    marker = r.IsTruncated ? r.NextPartNumberMarker : undefined
  } while (marker)
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }),
  )
}

export async function objectExists(key: string) {
  const { client, bucket } = config()
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (error) {
    if (
      error instanceof Error &&
      ["NotFound", "NoSuchKey"].includes(error.name)
    )
      return false
    throw error
  }
}
