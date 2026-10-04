import { after, NextResponse } from "next/server";
import { z } from "zod";

import { hasAccess, hasDownloadSession, startDownloadSession } from "@/lib/access";
import { getUploader } from "@/lib/auth";
import { sendFirstDownloadEmail } from "@/lib/email";
import { handle, HttpError, readJson } from "@/lib/http";
import { presignDownload } from "@/lib/r2";
import { db } from "@/lib/supabase/admin";
import { getFiles, getTransfer, isExpired } from "@/lib/transfers";
import type { SignedFile } from "@/lib/types";

const schema = z.object({ fileId: z.uuid().optional() });

/**
 * Public. Issues presigned GET URLs (valid 10 minutes) for one file or for
 * the whole transfer, after re-checking expiry and the password cookie.
 *
 * Issuing URLs is what counts as a download. A browser is counted once per
 * download session, so refreshing a URL halfway through a large zip does not
 * add to the count.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const input = await readJson(request, schema);

    const transfer = await getTransfer(id);
    if (!transfer || transfer.status === "pending") {
      throw new HttpError(404, "This transfer does not exist.", "not-found");
    }
    if (isExpired(transfer)) {
      throw new HttpError(410, "This transfer has expired.", "expired");
    }
    if (transfer.password_hash && !(await hasAccess(id))) {
      throw new HttpError(401, "Enter the password again to download.", "locked");
    }

    const all = await getFiles(id);
    const wanted = input.fileId ? all.filter((file) => file.id === input.fileId) : all;
    if (wanted.length === 0) throw new HttpError(404, "File not found.", "not-found");

    const files: SignedFile[] = await Promise.all(
      wanted.map(async (file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        url: await presignDownload(file.storage_key, file.name, file.content_type),
      })),
    );

    // The uploader checking their own link is not a download.
    const uploader = await getUploader();
    const isOwner = uploader?.id === transfer.owner_id;

    if (!isOwner && !(await hasDownloadSession(id))) {
      const { data, error } = await db().rpc("record_download", { p_transfer_id: id });
      if (error) console.error(`Could not record download: ${error.message}`);

      const first = Array.isArray(data) && data[0]?.is_first === true;
      if (first) {
        after(async () => {
          try {
            await sendFirstDownloadEmail(transfer);
          } catch (emailError) {
            console.error(emailError);
          }
        });
      }
    }
    if (!isOwner) await startDownloadSession(id);

    return NextResponse.json({ files }, { headers: { "Cache-Control": "no-store" } });
  });
}
