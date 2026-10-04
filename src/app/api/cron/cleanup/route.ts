import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { ABANDONED_UPLOAD_HOURS } from "@/lib/constants";
import { env } from "@/lib/env";
import { handle, jsonError } from "@/lib/http";
import { db } from "@/lib/supabase/admin";
import { deleteTransferObjects } from "@/lib/transfers";

export const maxDuration = 300;

const BATCH = 200;

function authorized(request: Request): boolean {
  const expected = Buffer.from(`Bearer ${env.cronSecret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function idsWhere(status: "ready" | "pending", column: string, before: string): Promise<string[]> {
  const { data, error } = await db()
    .from("transfers")
    .select("id")
    .eq("status", status)
    .lte(column, before)
    .limit(BATCH);
  if (error) throw new Error(`Could not query transfers: ${error.message}`);
  return (data ?? []).map((row: { id: string }) => row.id);
}

/**
 * Daily cleanup, invoked by Vercel Cron with `Authorization: Bearer CRON_SECRET`.
 *
 *  1. Expired transfers: delete their objects from R2, then mark them
 *     `expired`. The row stays so the link shows an "expired" page.
 *  2. Abandoned uploads (never completed): abort, delete objects and row.
 *
 * Objects are deleted before the row changes, so a failure half-way leaves
 * the transfer to be picked up again on the next run.
 */
export async function GET(request: Request) {
  return handle(async () => {
    if (!authorized(request)) return jsonError(401, "Unauthorized.");

    const now = new Date();
    const failures: string[] = [];

    let expired = 0;
    for (const id of await idsWhere("ready", "expires_at", now.toISOString())) {
      try {
        await deleteTransferObjects(id);
        const { error } = await db().from("transfers").update({ status: "expired" }).eq("id", id);
        if (error) throw new Error(error.message);
        expired++;
      } catch (error) {
        console.error(`Cleanup failed for ${id}`, error);
        failures.push(id);
      }
    }

    let abandoned = 0;
    const cutoff = new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000);
    for (const id of await idsWhere("pending", "created_at", cutoff.toISOString())) {
      try {
        await deleteTransferObjects(id);
        const { error } = await db().from("transfers").delete().eq("id", id);
        if (error) throw new Error(error.message);
        abandoned++;
      } catch (error) {
        console.error(`Cleanup failed for ${id}`, error);
        failures.push(id);
      }
    }

    return NextResponse.json(
      { expired, abandoned, failed: failures.length },
      { status: failures.length > 0 ? 500 : 200 },
    );
  });
}
