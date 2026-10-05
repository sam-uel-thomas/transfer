"use client";

import { animate, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";

/**
 * Route changes happen behind a curtain: an ink panel wipes up over the
 * page, the route changes underneath, and the panel carries on up and away.
 *
 *   idle -> covering -> covered (navigation runs here) -> revealing -> idle
 *
 * The new page's own entrance animations are held (html[data-pt], see
 * globals.css) until the curtain starts to lift, so the two read as one move.
 * With reduced motion on, changes simply happen.
 */

const WIPE = [0.76, 0, 0.24, 1] as const;
const COVER_SECONDS = 0.5;
const REVEAL_SECONDS = 0.65;

type Phase = "idle" | "covering" | "covered" | "revealing";

interface PageTransitionApi {
  /** Wipe to another route. `label` is shown small on the curtain. */
  navigate: (href: string, label?: string) => void;
  /** Wipe around anything else that swaps the page, e.g. `router.refresh()`. */
  run: (change: () => void, label?: string) => void;
}

const PageTransitionContext = createContext<PageTransitionApi | null>(null);

export function usePageTransition(): PageTransitionApi {
  const api = useContext(PageTransitionContext);
  if (!api) throw new Error("usePageTransition must be used inside <PageTransition>.");
  return api;
}

export function PageTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const curtain = useRef<HTMLDivElement>(null);
  const phase = useRef<Phase>("idle");
  const sawPending = useRef(false);
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();

  // Entrance animations wait for the intro curtain on a fresh load only.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.documentElement.dataset.ready = "";
    }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  const reveal = useCallback(async () => {
    const element = curtain.current;
    if (!element || phase.current !== "covered") return;
    phase.current = "revealing";
    delete document.documentElement.dataset.pt;
    await animate(element, { y: ["0%", "-100%"] }, { duration: REVEAL_SECONDS, ease: WIPE });
    delete element.dataset.on;
    element.style.transform = "";
    phase.current = "idle";
  }, []);

  // React's transition settles when the new route (or refresh) has rendered.
  useEffect(() => {
    if (pending) {
      sawPending.current = true;
    } else if (sawPending.current && phase.current === "covered") {
      void reveal();
    }
  }, [pending, reveal]);

  const run = useCallback(
    (change: () => void, nextLabel = "") => {
      if (phase.current !== "idle") return;
      const element = curtain.current;
      if (reducedMotion || !element) {
        startTransition(change);
        return;
      }

      phase.current = "covering";
      sawPending.current = false;
      setLabel(nextLabel);
      element.dataset.on = "";
      document.documentElement.dataset.pt = "";

      void animate(element, { y: ["100%", "0%"] }, { duration: COVER_SECONDS, ease: WIPE }).then(() => {
        phase.current = "covered";
        startTransition(change);
        // Never leave the curtain down: lift it if the change turned out to
        // be a no-op, or if the navigation hangs.
        window.setTimeout(() => {
          if (!sawPending.current) void reveal();
        }, 500);
        window.setTimeout(() => void reveal(), 10_000);
      });
    },
    [reducedMotion, reveal],
  );

  const api = useMemo<PageTransitionApi>(
    () => ({
      run,
      navigate: (href, nextLabel) => {
        router.prefetch(href);
        run(() => router.push(href), nextLabel);
      },
    }),
    [router, run],
  );

  return (
    <PageTransitionContext.Provider value={api}>
      {children}
      <div ref={curtain} className="page-curtain" aria-hidden="true">
        <p className="label gutter absolute bottom-6 left-0">{label}</p>
      </div>
    </PageTransitionContext.Provider>
  );
}

/** `next/link` that navigates behind the curtain. Falls back to a normal link for new-tab clicks. */
export function TransitionLink({
  href,
  label,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string; label?: string }) {
  const { navigate } = usePageTransition();
  const pathname = usePathname();

  return (
    <Link
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (href !== pathname) navigate(href, label);
      }}
    />
  );
}
