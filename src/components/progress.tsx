"use client";

import { motion, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect } from "react";

/**
 * A 0-100 value that eases toward `percent` instead of jumping. The spring is
 * overdamped, so it never overshoots or bounces. With reduced motion on, it
 * simply tracks the real value.
 */
export function useSmoothPercent(percent: number): MotionValue<number> {
  const reduced = useReducedMotion();
  const value = useSpring(percent, { stiffness: 60, damping: 20, mass: 0.8 });

  useEffect(() => {
    if (reduced) value.jump(percent);
    else value.set(percent);
  }, [percent, reduced, value]);

  return value;
}

/** The counting number. Floors, so "100" only shows when it is really done. */
export function PercentFigure({ value }: { value: MotionValue<number> }) {
  const text = useTransform(value, (current) => String(Math.max(0, Math.min(100, Math.floor(current + 0.0001)))));
  return <motion.span>{text}</motion.span>;
}

/** The thin accent bar. `now` is the true value, announced to assistive tech. */
export function ProgressBar({
  value,
  now,
  label,
  className,
}: {
  value: MotionValue<number>;
  now: number;
  label: string;
  className?: string;
}) {
  const scaleX = useTransform(value, (current) => Math.max(0, Math.min(1, current / 100)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.floor(now)}
      className={`h-[3px] w-full overflow-hidden bg-[color-mix(in_srgb,currentColor_14%,transparent)] ${className ?? ""}`}
    >
      <motion.div className="h-full w-full origin-left bg-accent" style={{ scaleX }} />
    </div>
  );
}
