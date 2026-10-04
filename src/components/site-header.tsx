import Link from "next/link";
import type { ReactNode } from "react";

const WORDMARK = "text-[0.9375rem] font-bold leading-none tracking-[-0.02em]";
const NAV_LINK = "underline-offset-4 hover:underline aria-[current=page]:underline";

/** Header for the uploader's own screens: wordmark, two links, sign out. */
export function UploaderHeader({ current }: { current: "new" | "transfers" }) {
  return (
    <header className="gutter">
      <div className="grid-12 rule-b items-baseline py-4 md:py-5">
        <Link href="/" className={`${WORDMARK} col-span-4`}>
          Transfer
        </Link>
        <nav aria-label="Main" className="label col-span-8 flex items-baseline justify-end gap-5 md:gap-8">
          <Link href="/" className={NAV_LINK} aria-current={current === "new" ? "page" : undefined}>
            New
          </Link>
          <Link
            href="/transfers"
            className={NAV_LINK}
            aria-current={current === "transfers" ? "page" : undefined}
          >
            Transfers
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="label underline-offset-4 hover:underline">
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
      <div className="grid-12 rule-b items-baseline py-4 md:py-5">
        <p className={`${WORDMARK} col-span-4`}>Transfer</p>
        {aside ? <p className="label tabular col-span-8 text-right">{aside}</p> : null}
      </div>
    </header>
  );
}
