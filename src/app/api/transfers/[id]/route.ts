import { NextResponse } from "next/server";

import { handle, HttpError, requireUploaderApi } from "@/lib/http";
import { db } from "@/lib/supabase/admin";
import { deleteTransferObjects, getTransfer } from "@/lib/transfers";

/** Delete now: removes the objects from R2, then the transfer itself. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const uploader = await requireUploaderApi(request);
    const { id } = await params;

    const transfer = await getTransfer(id);
    if (!transfer || transfer.owner_id !== uploader.id) {
      throw new HttpError(404, "Transfer not found.");
    }

    await deleteTransferObjects(id);

    const { error } = await db().from("transfers").delete().eq("id", id);
    if (error) throw new Error(`Could not delete transfer: ${error.message}`);

    return new NextResponse(null, { status: 204 });
  });
}
