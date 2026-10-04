"use client";

import { MotionConfig } from "motion/react";

import { EASE_OUT } from "@/lib/motion";

/**
 * `reducedMotion="user"` makes every motion component honour
 * prefers-reduced-motion: transforms are skipped, opacity still fades.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.3, ease: EASE_OUT }}>
      {children}
    </MotionConfig>
  );
}
