import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "outline" | "text";

const BUTTON_BASE =
  "select-none transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-40";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // The one accent-coloured control per screen. Near-black on accent is
  // 5.5:1; white on accent would be 3.2:1 and fail AA.
  primary:
    "text-title flex w-full items-center justify-between gap-6 bg-accent px-5 py-5 text-left text-ink not-disabled:hover:bg-fg not-disabled:hover:text-bg md:px-6 md:py-6",
  outline:
    "label inline-flex items-center justify-center gap-2 border border-current px-4 py-3 not-disabled:hover:bg-fg not-disabled:hover:text-bg",
  text: "label inline-flex items-center gap-2 underline-offset-4 not-disabled:hover:underline",
};

/** Class string for links that should look like buttons. */
export function buttonClass(variant: ButtonVariant, className?: string): string {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], className);
}

export function Button({
  variant = "outline",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

/** Row of two small labels above a headline: context left, detail right. */
export function Eyebrow({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="grid-12 label items-baseline">
      <p className="col-span-6">{left}</p>
      {right ? <p className="tabular col-span-6 text-right">{right}</p> : null}
    </div>
  );
}

const INPUT_CLASS =
  "text-lead block w-full border-0 border-b border-current bg-transparent px-0 py-2 text-fg focus-visible:outline-offset-4";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
}

/** Labelled, underlined text input. */
export function Field({
  label,
  hint,
  error,
  id,
  className,
  ...props
}: FieldProps & ComponentProps<"input"> & { id: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <div className="label flex items-baseline justify-between gap-4">
        <label htmlFor={id}>{label}</label>
        {hint ? (
          <span id={`${id}-hint`} className="muted">
            {hint}
          </span>
        ) : null}
      </div>
      <input
        id={id}
        className={INPUT_CLASS}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-bold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  id,
  className,
  ...props
}: FieldProps & ComponentProps<"textarea"> & { id: string }) {
  return (
    <div className={className}>
      <div className="label flex items-baseline justify-between gap-4">
        <label htmlFor={id}>{label}</label>
        {hint ? (
          <span id={`${id}-hint`} className="muted">
            {hint}
          </span>
        ) : null}
      </div>
      <textarea
        id={id}
        className={cn(INPUT_CLASS, "resize-none")}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
      />
    </div>
  );
}
