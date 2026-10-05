import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "outline" | "text";

const BUTTON_BASE = "select-none disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Hover fill: a block of the foreground colour rises from the bottom edge
 * and, on leaving, carries on out through the top. `isolate` keeps the
 * `::before` layer behind the label but above the button's own background.
 */
const WIPE_FILL =
  "relative isolate overflow-hidden transition-colors duration-300 ease-out before:absolute before:inset-0 before:-z-10 before:origin-top before:scale-y-0 before:bg-fg before:transition-transform before:duration-300 before:ease-out not-disabled:hover:text-bg not-disabled:hover:before:origin-bottom not-disabled:hover:before:scale-y-100";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // The one accent-coloured control per screen. Near-black on accent is
  // 5.5:1; white on accent would be 3.2:1 and fail AA.
  primary: `text-title flex w-full items-center justify-between gap-6 bg-accent px-5 py-5 text-left text-ink md:px-6 md:py-6 ${WIPE_FILL}`,
  outline: `label inline-flex items-center justify-center gap-2 border border-current px-4 py-3 ${WIPE_FILL}`,
  text: "label link-wipe",
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
      <p className="reveal col-span-6">{left}</p>
      {right ? <p className="tabular reveal col-span-6 text-right">{right}</p> : null}
    </div>
  );
}
