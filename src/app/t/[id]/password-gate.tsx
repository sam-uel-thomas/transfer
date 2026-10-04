"use client";

import { AnimatePresence, motion } from "motion/react";
import { useActionState } from "react";

import { Button, Field } from "@/components/ui";
import { stagger } from "@/lib/motion";

import { unlock, type UnlockState } from "./actions";

const INITIAL: UnlockState = { error: null, attempt: 0 };

export function PasswordGate({ id }: { id: string }) {
  const [state, action, pending] = useActionState(unlock, INITIAL);

  return (
    <form action={action} className="grid-12 rule-t items-end gap-y-8 pt-4">
      <input type="hidden" name="id" value={id} />
      <div className="reveal col-span-12 md:col-span-7 lg:col-span-5" style={stagger(2)}>
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          hint="From the sender"
          autoComplete="off"
          autoFocus
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "password-problem" : undefined}
        />
        {/* Keyed by attempt so a repeated error is re-announced and fades in again. */}
        <AnimatePresence mode="wait" initial={false}>
          {state.error ? (
            <motion.p
              key={state.attempt}
              id="password-problem"
              role="alert"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="pt-3 text-sm font-bold"
            >
              {state.error}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="reveal col-span-12 md:col-span-4 md:col-start-9" style={stagger(3)}>
        <Button type="submit" variant="primary" disabled={pending}>
          <span>{pending ? "Checking" : "Unlock"}</span>
        </Button>
      </div>
    </form>
  );
}
