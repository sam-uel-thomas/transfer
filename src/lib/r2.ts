import "server-only";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { DOWNLOAD_URL_TTL_SECONDS, UPLOAD_URL_TTL_SECONDS } from "@/lib/constants";
import { env } from "@/lib/env";
import { basename } from "@/lib/format";

let client: S3Client | undefined;

function r2(): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2AccessKeyId,
      secretAccessKey: env.r2SecretAccessKey,
    },
    // Newer SDKs add CRC32 checksum parameters by default. R2 rejects them on
    // presigned URLs, and a browser cannot supply the matching header anyway.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

/** Every object of a transfer lives under this prefix. */
export function transferPrefix(transferId: string): string {
  return `t/${transferId}/`;
}

export function storageKey(transferId: string, fileId: string): string {
  return `${transferPrefix(transferId)}${fileId}`;
}

// --- Uploads ---------------------------------------------------------------

/** Presigned PUT for a whole (small) file. The client must send `contentType`. */
export function presignPut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: env.r2Bucket, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const result = await r2().send(
    new CreateMultipartUploadCommand({ Bucket: env.r2Bucket, Key: key, ContentType: contentType }),
  );
  if (!result.UploadId) throw new Error("R2 did not return an upload ID.");
  return result.UploadId;
}

export function presignPart(key: string, uploadId: string, partNumber: number): Promise<string> {
  return getSignedUrl(
    r2(),
    new UploadPartCommand({
      Bucket: env.r2Bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

export interface UploadedPart {
  PartNumber: number;
  ETag: string;
  Size?: number;
}

/** Parts R2 already holds, so an interrupted upload can resume. */
export async function listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
  const parts: UploadedPart[] = [];
  let marker: string | undefined;
  do {
    const page = await r2().send(
      new ListPartsCommand({
        Bucket: env.r2Bucket,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: marker,
      }),
    );
    for (const part of page.Parts ?? []) {
      if (part.PartNumber && part.ETag) {
        parts.push({ PartNumber: part.PartNumber, ETag: part.ETag, Size: part.Size });
      }
    }
    marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
  } while (marker);
  return parts;
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: UploadedPart[],
): Promise<void> {
  const ordered = [...parts]
    .sort((a, b) => a.PartNumber - b.PartNumber)
    .map(({ PartNumber, ETag }) => ({ PartNumber, ETag }));
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: env.r2Bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: ordered },
    }),
  );
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  try {
    await r2().send(
      new AbortMultipartUploadCommand({ Bucket: env.r2Bucket, Key: key, UploadId: uploadId }),
    );
  } catch (error) {
    // Already completed or aborted: nothing left to clean up.
    if (error instanceof S3ServiceException && error.name === "NoSuchUpload") return;
    throw error;
  }
}

// --- Reads -----------------------------------------------------------------

/** Size of a stored object in bytes, or null if it does not exist. */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await r2().send(new HeadObjectCommand({ Bucket: env.r2Bucket, Key: key }));
    return head.ContentLength ?? null;
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      (error.name === "NotFound" || error.$metadata.httpStatusCode === 404)
    ) {
      return null;
    }
    throw error;
  }
}

/** `attachment` header that keeps the original name, including non-ASCII. */
function contentDisposition(filename: string): string {
  const name = basename(filename);
  const fallback = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Presigned GET that downloads under the original filename. Valid 10 minutes. */
export function presignDownload(key: string, filename: string, contentType: string): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      ResponseContentDisposition: contentDisposition(filename),
      ResponseContentType: contentType,
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );
}

// --- Deletes ---------------------------------------------------------------

/** Deletes every object under a prefix. Returns how many were removed. */
export async function deletePrefix(prefix: string): Promise<number> {
  let deleted = 0;
  let token: string | undefined;
  do {
    const page = await r2().send(
      new ListObjectsV2Command({
        Bucket: env.r2Bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [{ Key: object.Key }] : []));
    if (keys.length > 0) {
      const result = await r2().send(
        new DeleteObjectsCommand({
          Bucket: env.r2Bucket,
          Delete: { Objects: keys, Quiet: true },
        }),
      );
      if (result.Errors?.length) {
        const first = result.Errors[0];
        throw new Error(`R2 failed to delete ${first.Key}: ${first.Message}`);
      }
      deleted += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}
