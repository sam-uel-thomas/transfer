import "server-only";

import { TRANSFER_ID_PATTERN } from "@/lib/constants";
import { abortMultipartUpload, deletePrefix, transferPrefix } from "@/lib/r2";
import { db } from "@/lib/supabase/admin";
import type { FileRow, TransferRow } from "@/lib/types";

export function isTransferId(value: string): boolean {
  return TRANSFER_ID_PATTERN.test(value);
}

export async function getTransfer(id: string): Promise<TransferRow | null> {
  if (!isTransferId(id)) return null;
  const { data, error } = await db()
    .from("transfers")
    .select("*")
    .eq("id", id)
    .maybeSingle<TransferRow>();
  if (error) throw new Error(`Could not load transfer: ${error.message}`);
  return data;
}

export async function getFiles(transferId: string): Promise<FileRow[]> {
  const { data, error } = await db()
    .from("files")
    .select("*")
    .eq("transfer_id", transferId)
    .order("position", { ascending: true });
  if (error) throw new Error(`Could not load files: ${error.message}`);
  return (data ?? []) as FileRow[];
}

export async function listTransfers(ownerId: string): Promise<TransferRow[]> {
  const { data, error } = await db()
    .from("transfers")
    .select("*")
    .eq("owner_id", ownerId)
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not load transfers: ${error.message}`);
  return (data ?? []) as TransferRow[];
}

/** Name of the first file of each transfer, for one-line summaries. */
export async function getFirstFileNames(transferIds: string[]): Promise<Map<string, string>> {
  if (transferIds.length === 0) return new Map();
  const { data, error } = await db()
    .from("files")
    .select("transfer_id, name")
    .in("transfer_id", transferIds)
    .eq("position", 0);
  if (error) throw new Error(`Could not load file names: ${error.message}`);
  const rows = (data ?? []) as Pick<FileRow, "transfer_id" | "name">[];
  return new Map(rows.map((row) => [row.transfer_id, row.name]));
}

/** Expired by status (cron has run) or by clock (cron has not run yet). */
export function isExpired(transfer: Pick<TransferRow, "status" | "expires_at">): boolean {
  return transfer.status === "expired" || new Date(transfer.expires_at).getTime() <= Date.now();
}

export function expiryFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Removes everything a transfer holds in R2: finished objects and any
 * multipart uploads still in flight.
 */
export async function deleteTransferObjects(transferId: string): Promise<void> {
  const { data, error } = await db()
    .from("files")
    .select("storage_key, upload_id")
    .eq("transfer_id", transferId)
    .eq("uploaded", false)
    .not("upload_id", "is", null);
  if (error) throw new Error(`Could not load uploads: ${error.message}`);

  const unfinished = (data ?? []) as Pick<FileRow, "storage_key" | "upload_id">[];
  await Promise.all(
    unfinished.map((file) => abortMultipartUpload(file.storage_key, file.upload_id as string)),
  );
  await deletePrefix(transferPrefix(transferId));
}

/** Runs `task` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
