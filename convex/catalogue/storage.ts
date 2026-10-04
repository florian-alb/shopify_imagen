"use node"
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
export function storage() {
  const {
    R2_ACCOUNT_ID: account,
    CATALOG_R2_BUCKET: bucket,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
  } = process.env
  if (
    !account ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    bucket === process.env.R2_BUCKET
  )
    throw new Error("Le stockage privé des catalogues n’est pas configuré.")
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  }
}
// Multipart parts belong to the final object: no intermediate keys are created.
export async function exportStorage<T>(
  run: (io: {
    begin: (key: string, token: string) => Promise<string>
    exists: (key: string, token: string) => Promise<boolean>
    part: (
      key: string,
      id: string,
      number: number,
      body: Buffer,
    ) => Promise<string>
    finish: (
      key: string,
      id: string,
      parts: Array<{ ETag: string; PartNumber: number }>,
    ) => Promise<void>
  }) => Promise<T>,
) {
  const { client, bucket } = storage()
  try {
    return await run({
      begin: async (key, token) => {
        // A killed action may leave an uncommitted upload. Only this catalogue's key is reclaimed.
        let keyMarker: string | undefined, uploadIdMarker: string | undefined
        do {
          const pending = await client.send(
            new ListMultipartUploadsCommand({
              Bucket: bucket,
              Prefix: key,
              KeyMarker: keyMarker,
              UploadIdMarker: uploadIdMarker,
            }),
          )
          for (const upload of pending.Uploads ?? [])
            if (upload.Key === key)
              await client.send(
                new AbortMultipartUploadCommand({
                  Bucket: bucket,
                  Key: key,
                  UploadId: upload.UploadId,
                }),
              )
          keyMarker = pending.IsTruncated ? pending.NextKeyMarker : undefined
          uploadIdMarker = pending.NextUploadIdMarker
        } while (keyMarker)
        const upload = await client.send(
          new CreateMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            ContentType: "application/json",
            CacheControl: "private, no-store",
            Metadata: { token },
          }),
        )
        if (!upload.UploadId) throw new Error("Upload R2 non confirmé.")
        return upload.UploadId
      },
      exists: async (key, token) => {
        try {
          const head = await client.send(
            new HeadObjectCommand({ Bucket: bucket, Key: key }),
          )
          return head.Metadata?.token === token
        } catch (e) {
          if (
            (e as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode === 404
          )
            return false
          throw e
        }
      },
      part: async (key, id, number, body) => {
        const result = await client.send(
          new UploadPartCommand({
            Bucket: bucket,
            Key: key,
            UploadId: id,
            PartNumber: number,
            Body: body,
          }),
        )
        if (!result.ETag) throw new Error("Partie R2 non confirmée.")
        return result.ETag
      },
      finish: async (key, id, parts) => {
        await client.send(
          new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: id,
            MultipartUpload: { Parts: parts },
          }),
        )
      },
    })
  } finally {
    client.destroy()
  }
}
export async function signedExport(key: string) {
  const { client, bucket } = storage()
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: 'attachment; filename="catalogue.json"',
      }),
      { expiresIn: 300 },
    )
  } finally {
    client.destroy()
  }
}
