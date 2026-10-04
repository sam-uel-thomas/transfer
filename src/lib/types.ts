import type { ExpiryDays } from "./constants";

export type TransferStatus = "pending" | "ready" | "expired";

export interface TransferRow {
  id: string;
  owner_id: string;
  status: TransferStatus;
  message: string | null;
  recipient_email: string | null;
  password_hash: string | null;
  expires_in_days: ExpiryDays;
  expires_at: string;
  total_bytes: number;
  file_count: number;
  download_count: number;
  first_downloaded_at: string | null;
  failed_unlocks: number;
  locked_until: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface FileRow {
  id: string;
  transfer_id: string;
  position: number;
  name: string;
  size: number;
  content_type: string;
  storage_key: string;
  upload_id: string | null;
  uploaded: boolean;
  created_at: string;
}

/** What the download page is allowed to know about a file. */
export interface PublicFile {
  id: string;
  name: string;
  size: number;
}

export interface SignedFile extends PublicFile {
  url: string;
}
