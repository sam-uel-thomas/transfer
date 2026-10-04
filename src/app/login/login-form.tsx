"use client";

import { useActionState } from "react";

import { Button, Eyebrow, Field } from "@/components/ui";
import { stagger } from "@/lib/motion";

import { requestMagicLink, type LoginState } from "./actions";

const INITIAL: LoginState = { status: "idle" };

export function LoginForm({ notice }: { notice: string | null }) {
  const [state, action, pending] = useActionState(requestMagicLink, INITIAL);

  if (state.status === "sent") {
    return (
      <>
        <Eyebrow left="Sign in" right="Link sent" />
        <h1 className="text-display reveal py-12 text-balance">Check your inbox.</h1>
        <div className="grid-12 rule-t pt-4">
          <p role="status" className="text-lead reveal col-span-12 md:col-span-7 lg:col-span-5" style={stagger(2)}>
            If <strong className="break-all">{state.email}</strong> is the address this site belongs to, a
            sign-in link is on its way. Open it in this browser.
          </p>
        </div>
      </>
    );
  }

  const error = state.status === "error" ? state.message : notice;

  return (
    <>
      <Eyebrow left="Sign in" right="Uploader only" />
      <h1 className="text-display reveal py-12">Sign in.</h1>
      <form action={action} className="grid-12 rule-t items-end gap-y-8 pt-4">
        <Field
          className="reveal col-span-12 md:col-span-7 lg:col-span-5"
          style={stagger(2)}
          id="email"
          name="email"
          type="email"
          inputMode="email"
          label="Email"
          hint="A sign-in link is sent here"
          placeholder="you@example.com"
          autoComplete="email"
          spellCheck={false}
          required
          error={error}
        />
        <div className="reveal col-span-12 md:col-span-4 md:col-start-9" style={stagger(3)}>
          <Button type="submit" variant="primary" disabled={pending}>
            <span>{pending ? "Sending" : "Send link"}</span>
          </Button>
        </div>
      </form>
    </>
  );
}
