import "server-only";

import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface Uploader {
  id: string;
  email: string;
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === env.allowedEmail;
}

/**
 * The signed-in uploader, or null. The session JWT is verified (not just
 * decoded) and its email must equal ALLOWED_EMAIL.
 */
export async function getUploader(): Promise<Uploader | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  const { sub, email } = data.claims;
  if (typeof sub !== "string" || typeof email !== "string") return null;
  if (!isAllowedEmail(email)) return null;

  return { id: sub, email };
}

/** For pages: sends anyone who is not the uploader to the login screen. */
export async function requireUploader(): Promise<Uploader> {
  const uploader = await getUploader();
  if (!uploader) redirect("/login");
  return uploader;
}
