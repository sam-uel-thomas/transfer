import type { ReactNode } from "react";

import { TransitionLink } from "./page-transition";

const WORDMARK = "text-[0.9375rem] font-bold leading-none tracking-[-0.02em]";

/** Header for the uploader's own screens: wordmark, two links, sign out. */
export function UploaderHeader({ current }: { current: "new" | "transfers" }) {
  return (
    <header className="gutter">
      <div className="grid-12 draw-b items-baseline py-4 md:py-5">
        <TransitionLink href="/" label="New transfer" className={`${WORDMARK} col-span-4`}>
          Transfer
        </TransitionLink>
        <nav aria-label="Main" className="label col-span-8 flex items-baseline justify-end gap-5 md:gap-8">
          <TransitionLink
            href="/"
            label="New transfer"
            className="link-wipe"
            aria-current={current === "new" ? "page" : undefined}
          >
            New
          </TransitionLink>
          <TransitionLink
            href="/transfers"
            label="Transfers"
            className="link-wipe"
            aria-current={current === "transfers" ? "page" : undefined}
          >
            Transfers
          </TransitionLink>
          <form action="/auth/signout" method="post">
            <button type="submit" className="label link-wipe">
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}

/** Header for public pages. The wordmark is not a link: recipients have no home. */
export function PublicHeader({ aside }: { aside?: ReactNode }) {
  return (
    <header className="gutter">
      <div className="grid-12 draw-b items-baseline py-4 md:py-5">
        <p className={`${WORDMARK} col-span-4`}>Transfer</p>
        {aside ? <p className="label tabular col-span-8 text-right">{aside}</p> : null}
      </div>
    </header>
  );
}
