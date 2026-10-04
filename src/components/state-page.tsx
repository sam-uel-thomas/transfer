import type { ReactNode } from "react";

import { stagger } from "@/lib/motion";

import { PublicHeader } from "./site-header";
import { Eyebrow } from "./ui";

/**
 * Full-screen message in the house style: label, one oversized word, a rule,
 * a sentence. Used for expired, locked, not-found, error and empty states.
 */
export function StatePage({
  header,
  label,
  detail,
  title,
  children,
  action,
}: {
  header?: ReactNode;
  label: string;
  detail?: string;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {header ?? <PublicHeader />}
      <main className="gutter flex flex-1 flex-col justify-between pt-5 pb-8 md:pt-6">
        <Eyebrow left={label} right={detail} />
        <h1 className="text-display reveal py-12 text-balance">{title}</h1>
        <div className="grid-12 rule-t items-end gap-y-8 pt-4">
          <div className="text-lead reveal col-span-12 md:col-span-7 lg:col-span-5" style={stagger(2)}>
            {children}
          </div>
          {action ? (
            <div className="reveal col-span-12 md:col-span-4 md:col-start-9" style={stagger(3)}>
              {action}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
