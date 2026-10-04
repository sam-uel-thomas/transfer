/** Hard cap on the combined size of one transfer (10 GB, decimal). */
export const MAX_TRANSFER_BYTES = 10 * 1000 ** 3;

export const MAX_FILES_PER_TRANSFER = 500;

/** Files larger than this are uploaded with S3 multipart. */
export const MULTIPART_THRESHOLD_BYTES = 100 * 1024 ** 2;

export const EXPIRY_OPTIONS = [1, 3, 7] as const;
export type ExpiryDays = (typeof EXPIRY_OPTIONS)[number];

export const MAX_MESSAGE_LENGTH = 2000;
/** bcrypt only reads the first 72 bytes of its input. */
export const MAX_PASSWORD_LENGTH = 72;
export const MAX_FILENAME_LENGTH = 1024;

/** Lifetime of a presigned download URL. */
export const DOWNLOAD_URL_TTL_SECONDS = 10 * 60;
/** Lifetime of a presigned upload URL (single PUT or one part). */
export const UPLOAD_URL_TTL_SECONDS = 60 * 60;

/** Lifetime of the cookie set after a correct password. */
export const ACCESS_COOKIE_TTL_SECONDS = 30 * 60;
/** Repeat downloads from one browser inside this window count once. */
export const DOWNLOAD_SESSION_TTL_SECONDS = 2 * 60 * 60;

/** Uploads that never finished are cleaned up after this long. */
export const ABANDONED_UPLOAD_HOURS = 48;

export const TRANSFER_ID_LENGTH = 10;
export const TRANSFER_ID_PATTERN = /^[A-Za-z0-9_-]{10}$/;

/**
 * Part size for multipart uploads. Every part but the last must be the same
 * size on R2. Larger parts for larger files keep the request count down.
 */
export function chunkSizeFor(fileSize: number): number {
  const MiB = 1024 ** 2;
  if (fileSize <= 2 * 1024 ** 3) return 16 * MiB;
  return 32 * MiB;
}
