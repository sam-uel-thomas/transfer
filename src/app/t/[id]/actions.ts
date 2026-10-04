"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import { grantAccess } from "@/lib/access";
import { timeUntil } from "@/lib/format";
import { db } from "@/lib/supabase/admin";
import { getTransfer, isExpired } from "@/lib/transfers";

export interface UnlockState {
  error: string | null;
  /** Changes on every failed attempt so the UI can re-announce the error. */
  attempt: number;
}

/**
 * Checks the transfer password. On success it sets a signed, httpOnly cookie
 * valid for 30 minutes and reloads the page, which then shows the files.
 */
export async function unlock(previous: UnlockState, formData: FormData): Promise<UnlockState> {
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  const fail = (error: string): UnlockState => ({ error, attempt: previous.attempt + 1 });

  const transfer = await getTransfer(id);
  if (!transfer || transfer.status === "pending") return fail("This transfer no longer exists.");
  // The page itself renders the expired state, or the files if no password is set.
  if (isExpired(transfer) || !transfer.password_hash) redirect(`/t/${id}`);

  if (transfer.locked_until && new Date(transfer.locked_until) > new Date()) {
    return fail(`Too many attempts. Try again in ${timeUntil(transfer.locked_until)}.`);
  }
  if (!password) return fail("Enter the password.");

  if (!(await bcrypt.compare(password, transfer.password_hash))) {
    const { data: lockedUntil, error } = await db().rpc("record_failed_unlock", { p_transfer_id: id });
    if (error) console.error(`Could not record failed unlock: ${error.message}`);
    const locked = typeof lockedUntil === "string" && new Date(lockedUntil) > new Date();
    return fail(locked ? "Too many attempts. Try again in 15 minutes." : "Wrong password. Try again.");
  }

  if (transfer.failed_unlocks > 0 || transfer.locked_until) {
    await db().from("transfers").update({ failed_unlocks: 0, locked_until: null }).eq("id", id);
  }
  await grantAccess(id);
  redirect(`/t/${id}`);
}
