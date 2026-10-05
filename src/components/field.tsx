"use client";

import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";

import { cn } from "./ui";

/**
 * Text inputs. Each is a label row over an underlined control (see
 * `field-line` in globals.css): the line strengthens on hover and a heavier
 * one sweeps across on focus, which replaces the boxed focus outline.
 */

const CONTROL = "text-lead block w-full border-0 bg-transparent px-0 py-2 text-fg";

interface FieldBase {
  id: string;
  label: string;
  /** Short note on the right of the label row, e.g. "Optional". */
  hint?: string;
  error?: string | null;
  /** Change this to re-announce (and fade in again) an error whose text is unchanged. */
  errorKey?: string | number;
  className?: string;
  style?: CSSProperties;
}

function Frame({
  id,
  label,
  hint,
  action,
  error,
  errorKey,
  className,
  style,
  children,
}: FieldBase & { action?: ReactNode; children: ReactNode }) {
  return (
    <div className={className} style={style}>
      <div className="label flex items-baseline justify-between gap-4">
        <label htmlFor={id}>{label}</label>
        {action ??
          (hint ? (
            <span id={`${id}-hint`} className="muted">
              {hint}
            </span>
          ) : null)}
      </div>
      <div className="field-line">{children}</div>
      {error ? (
        <p key={errorKey} id={`${id}-error`} role="alert" className="reveal pt-2 text-sm font-bold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string | null): string | undefined {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

type InputProps = FieldBase & Omit<ComponentProps<"input">, "id" | "className" | "style">;

export function Field({ id, label, hint, error, errorKey, className, style, ...props }: InputProps) {
  return (
    <Frame id={id} label={label} hint={hint} error={error} errorKey={errorKey} className={className} style={style}>
      <input
        id={id}
        className={CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </Frame>
  );
}

/** Password input with a Show / Hide toggle in place of the hint. */
export function PasswordField({
  id,
  label,
  error,
  errorKey,
  className,
  style,
  ...props
}: Omit<InputProps, "hint" | "type">) {
  const [shown, setShown] = useState(false);
  return (
    <Frame
      id={id}
      label={label}
      error={error}
      errorKey={errorKey}
      className={className}
      style={style}
      action={
        <button
          type="button"
          className="label link-wipe"
          aria-pressed={shown}
          aria-controls={id}
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown((value) => !value)}
        >
          {shown ? "Hide" : "Show"}
        </button>
      }
    >
      <input
        id={id}
        type={shown ? "text" : "password"}
        className={CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, undefined, error)}
        autoCapitalize="none"
        spellCheck={false}
        {...props}
      />
    </Frame>
  );
}

type TextAreaProps = FieldBase & Omit<ComponentProps<"textarea">, "id" | "className" | "style" | "rows">;

/** Starts one line tall, like the inputs beside it, and grows with its text. */
export function TextArea({ id, label, hint, error, errorKey, className, style, ...props }: TextAreaProps) {
  const control = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = control.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [props.value]);

  return (
    <Frame id={id} label={label} hint={hint} error={error} errorKey={errorKey} className={className} style={style}>
      <textarea
        ref={control}
        id={id}
        rows={1}
        className={cn(CONTROL, "max-h-[40vh] resize-none overflow-y-auto")}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </Frame>
  );
}
