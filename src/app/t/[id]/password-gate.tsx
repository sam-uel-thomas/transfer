"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { PasswordField } from "@/components/field";
import { usePageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui";
import { stagger } from "@/lib/motion";

import { unlock, type UnlockState } from "./actions";

const INITIAL: UnlockState = { error: null, attempt: 0 };

export function PasswordGate({ id }: { id: string }) {
  const router = useRouter();
  const { run } = usePageTransition();
  const [state, action, pending] = useActionState(unlock, INITIAL);

  // Unlocked: re-render the page, now with access, behind the curtain.
  useEffect(() => {
    if (state.ok) run(() => router.refresh(), "Unlocked");
  }, [state.ok, run, router]);

  const busy = pending || state.ok === true;

  return (
    <form action={action} className="grid-12 draw-t items-end gap-y-8 pt-4">
      <input type="hidden" name="id" value={id} />
      <PasswordField
        className="reveal col-span-12 md:col-span-7 lg:col-span-5"
        style={stagger(4)}
        id="password"
        name="password"
        label="Password"
        error={state.error}
        errorKey={state.attempt}
        // Not an account login, so keep password managers out of it.
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        autoFocus
        required
      />
      <div className="reveal col-span-12 md:col-span-4 md:col-start-9" style={stagger(6)}>
        <Button type="submit" variant="primary" disabled={busy}>
          <span>{state.ok ? "Unlocked" : pending ? "Checking" : "Unlock"}</span>
        </Button>
      </div>
    </form>
  );
}
