import { Fragment, type ReactNode } from "react";

import { stagger } from "@/lib/motion";

import { cn } from "./ui";

/**
 * Display heading whose lines rise from behind a mask, one after another.
 * Pure CSS (see `line-mask` / `line-rise`), so it works in server components
 * and plays whenever the heading mounts.
 *
 * `inline` puts the lines side by side from `md` up, for a heading that is
 * two lines on a phone and one on a desktop.
 */
export function Headline({
  lines,
  as: Tag = "h1",
  inline = false,
  className,
  "aria-hidden": ariaHidden,
}: {
  lines: ReactNode[];
  as?: "h1" | "h2" | "p";
  inline?: boolean;
  className?: string;
  "aria-hidden"?: boolean;
}) {
  return (
    <Tag className={className} aria-hidden={ariaHidden}>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {inline && index > 0 ? " " : null}
          <span className={cn("line-mask", inline && "md:inline-block md:align-top")}>
            <span className="line-rise" style={stagger(index)}>
              {line}
            </span>
          </span>
        </Fragment>
      ))}
    </Tag>
  );
}
