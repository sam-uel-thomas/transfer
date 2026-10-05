"use server";

import { z } from "zod";

import { isAllowedEmail } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
  /** Echoed back so the email field keeps its value after a failed attempt. */
  email: string;
  /** Changes on every failed attempt so the UI can re-announce the error. */
  attempt: number;
  /** Signed in. The form then moves on to the upload screen. */
  ok?: true;
}

const schema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});

/** One message for every kind of wrong credential, so nothing is revealed. */
const WRONG = "Wrong email or password.";

/**
 * Email and password sign-in for the one uploader account.
 *
 * Every submitted address takes the same path through Supabase, so response
 * time does not reveal which address is the real one. A correct password is
 * still not enough: the account must also be ALLOWED_EMAIL.
 */
export async function signIn(previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fail = (error: string): LoginState => ({ error, email, attempt: previous.attempt + 1 });

  if (!schema.safeParse({ email, password }).success) return fail("Enter your email and password.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.status === 429) return fail("Too many attempts. Wait a minute, then try again.");
    if (error.code === "invalid_credentials") return fail(WRONG);
    // Unconfirmed account, sign-ins disabled, Supabase unreachable, and so on.
    console.error(`Sign-in failed: ${error.code ?? error.status ?? "unknown"} ${error.message}`);
    return fail(
      error.status && error.status < 500 ? WRONG : "Sign-in is unavailable right now. Try again in a moment.",
    );
  }

  if (!isAllowedEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return fail(WRONG);
  }

  // The session cookie is set by now. Navigation is left to the client so it
  // can happen behind the page transition.
  return { error: null, email, attempt: previous.attempt, ok: true };
}
