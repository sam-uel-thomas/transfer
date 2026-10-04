import { NextResponse } from "next/server";
import { z } from "zod";

import { MULTIPART_THRESHOLD_BYTES } from "@/lib/constants";
import { handle, HttpError, readJson, requireUploaderApi } from "@/lib/http";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  listParts,
  objectSize,
  presignPart,
  presignPut,
} from "@/lib/r2";
import { db } from "@/lib/supabase/admin";
import type { FileRow, TransferRow } from "@/lib/types";

/**
 * The single entry point for everything that touches an upload in R2.
 *
 * The browser sends bytes straight to R2 using the URLs issued here; no file
 * data passes through this handler. Every action first verifies the session
 * and ALLOWED_EMAIL (requireUploaderApi), then that the file belongs to a
 * pending transfer owned by that user. The object key always comes from the
 * database, never from the client.
 */

const fileId = z.uuid();
const uploadId = z.string().min(1).max(1024);
const partNumber = z.number().int().min(1).max(10_000);

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sign-put"), fileId }),
  z.object({ action: z.literal("create-multipart"), fileId }),
  z.object({ action: z.literal("sign-part"), fileId, uploadId, partNumber }),
  z.object({ action: z.literal("list-parts"), fileId, uploadId }),
  z.object({
    action: z.literal("complete-multipart"),
    fileId,
    uploadId,
    parts: z
      .array(z.object({ PartNumber: partNumber, ETag: z.string().min(1).max(256) }))
      .min(1)
      .max(10_000),
  }),
  z.object({ action: z.literal("abort-multipart"), fileId, uploadId }),
]);

type OwnedFile = FileRow & { transfers: Pick<TransferRow, "owner_id" | "status"> };

async function loadPendingFile(id: string, ownerId: string): Promise<FileRow> {
  const { data, error } = await db()
    .from("files")
    .select("*, transfers!inner(owner_id, status)")
    .eq("id", id)
    .maybeSingle<OwnedFile>();
  if (error) throw new Error(`Could not load file: ${error.message}`);

  if (!data || data.transfers.owner_id !== ownerId) {
    throw new HttpError(404, "File not found.");
  }
  if (data.transfers.status !== "pending") {
    throw new HttpError(409, "This transfer is already finished.");
  }
  return data;
}

async function setUploadId(id: string, value: string | null) {
  const { error } = await db().from("files").update({ upload_id: value }).eq("id", id);
  if (error) throw new Error(`Could not update file: ${error.message}`);
}

function assertCurrentUpload(file: FileRow, id: string) {
  if (file.upload_id !== id) {
    throw new HttpError(409, "This upload was restarted. Retry the file.");
  }
}

export async function POST(request: Request) {
  return handle(async () => {
    const uploader = await requireUploaderApi(request);
    const input = await readJson(request, schema);
    const file = await loadPendingFile(input.fileId, uploader.id);
    const key = file.storage_key;

    switch (input.action) {
      case "sign-put": {
        if (file.size > MULTIPART_THRESHOLD_BYTES) {
          throw new HttpError(400, "This file must be uploaded in parts.");
        }
        const url = await presignPut(key, file.content_type);
        return NextResponse.json({ url, headers: { "Content-Type": file.content_type } });
      }

      case "create-multipart": {
        // A retry after a failed attempt starts over; drop the old upload.
        if (file.upload_id) await abortMultipartUpload(key, file.upload_id).catch(console.error);
        const id = await createMultipartUpload(key, file.content_type);
        await setUploadId(file.id, id);
        return NextResponse.json({ uploadId: id, key });
      }

      case "sign-part": {
        assertCurrentUpload(file, input.uploadId);
        const url = await presignPart(key, input.uploadId, input.partNumber);
        return NextResponse.json({ url });
      }

      case "list-parts": {
        assertCurrentUpload(file, input.uploadId);
        return NextResponse.json({ parts: await listParts(key, input.uploadId) });
      }

      case "complete-multipart": {
        // A repeat of a call whose response was lost finds the object already
        // assembled; treat that as success rather than an error.
        const assembled = async () => (await objectSize(key)) === file.size;
        if (file.upload_id !== input.uploadId) {
          if (await assembled()) return NextResponse.json({});
          assertCurrentUpload(file, input.uploadId);
        }
        try {
          await completeMultipartUpload(key, input.uploadId, input.parts);
        } catch (error) {
          if (!(await assembled())) throw error;
        }
        await setUploadId(file.id, null);
        return NextResponse.json({});
      }

      case "abort-multipart": {
        if (file.upload_id === input.uploadId) {
          await abortMultipartUpload(key, input.uploadId);
          await setUploadId(file.id, null);
        }
        return NextResponse.json({});
      }
    }
  });
}
