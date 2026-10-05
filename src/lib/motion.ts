import type { Variants } from "motion/react";

/** The one easing curve used everywhere. Matches --ease-out in globals.css. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * Whole-view swap: a plain cross-fade. The movement comes from what is inside
 * the view (headline lines rising, rules drawing), not from the view itself.
 */
export const viewTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.2, ease: EASE_OUT } },
} as const;

/**
 * List rows. Pass the row index as `custom`; the stagger stops growing after
 * a dozen rows so long lists do not take seconds to appear.
 */
export const rowVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_OUT, delay: Math.min(index, 12) * 0.035 },
  }),
  removed: { opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } },
};

/** CSS custom property for the pure-CSS `.reveal` stagger. */
export function stagger(index: number): React.CSSProperties {
  return { "--i": Math.min(index, 14) } as React.CSSProperties;
}
