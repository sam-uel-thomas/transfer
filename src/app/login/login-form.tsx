"use client";

import { useActionState, useEffect } from "react";

import { Field, PasswordField } from "@/components/field";
import { Headline } from "@/components/headline";
import { usePageTransition } from "@/components/page-transition";
import { Button, Eyebrow } from "@/components/ui";
import { stagger } from "@/lib/motion";

import { signIn, type LoginState } from "./actions";

const INITIAL: LoginState = { error: null, email: "", attempt: 0 };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, INITIAL);
  const { navigate } = usePageTransition();

  // Signed in: the session cookie is set, so move on behind the curtain.
  useEffect(() => {
    if (state.ok) navigate("/", "New transfer");
  }, [state.ok, navigate]);

  const busy = pending || state.ok === true;

  return (
    <>
      <Eyebrow left="Sign in" right="Uploader only" />
      <Headline className="text-display py-12" lines={["Sign in."]} />
      <form action={action} className="grid-12 draw-t items-end gap-y-8 pt-4">
        <Field
          className="reveal col-span-12 md:col-span-4"
          style={stagger(4)}
          id="email"
          name="email"
          type="email"
          inputMode="email"
          label="Email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-problem" : undefined}
          required
        />
        <PasswordField
          className="reveal col-span-12 md:col-span-4"
          style={stagger(5)}
          id="password"
          name="password"
          label="Password"
          autoComplete="current-password"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-problem" : undefined}
          required
        />
        {/* Keyed by attempt so a repeated error fades in and is announced again. */}
        {state.error ? (
          <p
            key={state.attempt}
            id="login-problem"
            role="alert"
            className="reveal col-span-12 -mt-4 text-sm font-bold md:col-span-8 md:row-start-2"
          >
            {state.error}
          </p>
        ) : null}
        <div className="reveal col-span-12 md:col-span-4 md:col-start-9 md:row-start-1" style={stagger(6)}>
          <Button type="submit" variant="primary" disabled={busy}>
            <span>{busy ? "Signing in" : "Sign in"}</span>
          </Button>
        </div>
      </form>
    </>
  );
}
