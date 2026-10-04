import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  MAX_FILENAME_LENGTH,
  MAX_FILES_PER_TRANSFER,
  MAX_MESSAGE_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_TRANSFER_BYTES,
  TRANSFER_ID_LENGTH,
} from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import { handle, HttpError, readJson, requireUploaderApi } from "@/lib/http";
import { storageKey } from "@/lib/r2";
import { db } from "@/lib/supabase/admin";
import { expiryFromNow } from "@/lib/transfers";

const schema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(MAX_FILENAME_LENGTH),
        size: z.number().int().positive("Empty files cannot be sent."),
        type: z.string().max(255).optional(),
      }),
    )
    .min(1, "Add at least one file.")
    .max(MAX_FILES_PER_TRANSFER, `A transfer can hold at most ${MAX_FILES_PER_TRANSFER} files.`),
  message: z.string().trim().max(MAX_MESSAGE_LENGTH).optional(),
  recipientEmail: z.email("Enter a valid recipient email.").max(320).optional(),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH).optional(),
  expiresInDays: z.union([z.literal(1), z.literal(3), z.literal(7)], {
    error: "Expiry must be 1, 3 or 7 days.",
  }),
});

const MIME_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

/** Keeps folder structure ("Photos/a.jpg") but drops anything path-traversal-like. */
function cleanName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
  if (!cleaned) throw new HttpError(400, "A file has an invalid name.");
  return cleaned;
}

/** Creates a pending transfer and its file rows. Uploads are signed separately. */
export async function POST(request: Request) {
  return handle(async () => {
    const uploader = await requireUploaderApi(request);
    const input = await readJson(request, schema);

    const totalBytes = input.files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TRANSFER_BYTES) {
      throw new HttpError(
        413,
        `This transfer is ${formatBytes(totalBytes)}. The limit is ${formatBytes(MAX_TRANSFER_BYTES)}.`,
        "too-large",
      );
    }

    const id = nanoid(TRANSFER_ID_LENGTH);
    const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : null;

    const { error: transferError } = await db()
      .from("transfers")
      .insert({
        id,
        owner_id: uploader.id,
        status: "pending",
        message: input.message || null,
        recipient_email: input.recipientEmail?.toLowerCase() ?? null,
        password_hash: passwordHash,
        expires_in_days: input.expiresInDays,
        // Provisional. Reset when the upload completes, so the clock starts
        // once the files are actually available.
        expires_at: expiryFromNow(input.expiresInDays),
        total_bytes: totalBytes,
        file_count: input.files.length,
      });
    if (transferError) throw new Error(`Could not create transfer: ${transferError.message}`);

    const rows = input.files.map((file, position) => {
      const fileId = randomUUID();
      return {
        id: fileId,
        transfer_id: id,
        position,
        name: cleanName(file.name),
        size: file.size,
        content_type: file.type && MIME_PATTERN.test(file.type) ? file.type : "application/octet-stream",
        storage_key: storageKey(id, fileId),
      };
    });

    const { error: filesError } = await db().from("files").insert(rows);
    if (filesError) {
      await db().from("transfers").delete().eq("id", id);
      throw new Error(`Could not create files: ${filesError.message}`);
    }

    return NextResponse.json(
      { id, files: rows.map((row) => ({ id: row.id, position: row.position })) },
      { status: 201 },
    );
  });
}
