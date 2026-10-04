import { NextResponse } from "next/server";

import { MAX_TRANSFER_BYTES } from "@/lib/constants";
import { sendTransferEmail } from "@/lib/email";
import { formatBytes, pluralize } from "@/lib/format";
import { handle, HttpError, requireUploaderApi } from "@/lib/http";
import { objectSize } from "@/lib/r2";
import { db } from "@/lib/supabase/admin";
import { deleteTransferObjects, expiryFromNow, getFiles, getTransfer, mapLimit } from "@/lib/transfers";
import type { TransferRow } from "@/lib/types";

/**
 * Called once the browser has uploaded every file. Nothing the client says is
 * trusted here: each object is looked up in R2 and its real size is compared
 * with what was declared, and the 10 GB cap is re-checked against the real
 * total before the transfer goes live.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const uploader = await requireUploaderApi(request);
    const { id } = await params;

    const transfer = await getTransfer(id);
    if (!transfer || transfer.owner_id !== uploader.id) {
      throw new HttpError(404, "Transfer not found.");
    }
    if (transfer.status === "ready") {
      return NextResponse.json({ id, expiresAt: transfer.expires_at, emailed: false, emailFailed: false });
    }
    if (transfer.status !== "pending") {
      throw new HttpError(409, "This transfer has expired.");
    }

    const files = await getFiles(id);
    const sizes = await mapLimit(files, 16, (file) => objectSize(file.storage_key));

    const incomplete = files.filter((file, index) => sizes[index] !== file.size);
    if (incomplete.length > 0) {
      throw new HttpError(
        409,
        `${pluralize(incomplete.length, "file")} did not upload completely. Retry to finish.`,
        "incomplete",
      );
    }

    const totalBytes = sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0);
    if (totalBytes > MAX_TRANSFER_BYTES) {
      await deleteTransferObjects(id);
      await db().from("transfers").delete().eq("id", id);
      throw new HttpError(413, `Transfers are limited to ${formatBytes(MAX_TRANSFER_BYTES)}.`, "too-large");
    }

    const { error: filesError } = await db()
      .from("files")
      .update({ uploaded: true, upload_id: null })
      .eq("transfer_id", id);
    if (filesError) throw new Error(`Could not update files: ${filesError.message}`);

    // The status guard makes this a no-op for a concurrent second call, so
    // the recipient is only ever emailed once.
    const expiresAt = expiryFromNow(transfer.expires_in_days);
    const { data: ready, error } = await db()
      .from("transfers")
      .update({
        status: "ready",
        completed_at: new Date().toISOString(),
        expires_at: expiresAt,
        total_bytes: totalBytes,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle<TransferRow>();
    if (error) throw new Error(`Could not finish transfer: ${error.message}`);

    let emailed = false;
    let emailFailed = false;
    if (ready?.recipient_email) {
      try {
        await sendTransferEmail(ready);
        emailed = true;
      } catch (emailError) {
        console.error(emailError);
        emailFailed = true;
      }
    }

    return NextResponse.json({ id, expiresAt: ready?.expires_at ?? expiresAt, emailed, emailFailed });
  });
}
