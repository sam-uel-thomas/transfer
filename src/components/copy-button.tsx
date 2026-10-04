"use client";

import { useEffect, useState } from "react";

import { Button } from "./ui";

/** Copies `text` and confirms in place for two seconds. */
export function CopyButton({
  text,
  variant = "text",
  label = "Copy link",
  className,
}: {
  text: string;
  variant?: "primary" | "outline" | "text";
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  const shown = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label;

  return (
    <Button variant={variant} className={className} onClick={copy}>
      <span aria-live="polite">{shown}</span>
    </Button>
  );
}
