"use server";

import { z } from "zod";

import { isAllowedEmail } from "@/lib/auth";
import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

/**
 * Sends a magic link, but only ever to ALLOWED_EMAIL. Any other address gets
 * the same "sent" response, so the form does not reveal which one is allowed.
 */
export async function requestMagicLink(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  if (isAllowedEmail(email)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${env.appUrl}/auth/confirm`, shouldCreateUser: true },
    });
    if (error) {
      console.error(error);
      const message =
        error.status === 429
          ? "Too many requests. Wait a minute, then try again."
          : "Could not send the link. Try again.";
      return { status: "error", message };
    }
  }

  return { status: "sent", email };
}
