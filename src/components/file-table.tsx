"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { memo, type ReactNode } from "react";

import { formatBytes, rowNumber } from "@/lib/format";

import { cn } from "./ui";

/**
 * File list laid out on the page grid with CSS subgrid, so every column
 * lines up with the 12 columns above and below it. ARIA table roles keep the
 * tabular meaning that the grid layout would otherwise drop.
 *
 *  - "wide":   the table spans all 12 columns.
 *  - "narrow": the table sits in a 7-column area on large screens.
 *
 * Below `md` each row wraps onto two lines: name, then size and action.
 */
type Columns = "wide" | "narrow";

const SUBGRID = "col-span-full grid grid-cols-subgrid";

const CELLS: Record<Columns, { index: string; name: string; size: string; trailing: string }> = {
  wide: {
    index: "col-span-1",
    name: "col-span-11 md:col-span-7",
    size: "col-span-5 col-start-2 md:col-span-2 md:col-start-auto",
    trailing: "col-span-6 md:col-span-2",
  },
  narrow: {
    index: "col-span-1",
    name: "col-span-11 md:col-span-7 lg:col-span-4",
    size: "col-span-5 col-start-2 md:col-span-2 md:col-start-auto lg:col-span-1",
    trailing: "col-span-6 md:col-span-2 lg:col-span-1",
  },
};

export function FileTable({
  label,
  columns = "wide",
  trailingLabel,
  children,
}: {
  label: string;
  columns?: Columns;
  trailingLabel: string;
  children: ReactNode;
}) {
  const cells = CELLS[columns];
  return (
    <div role="table" aria-label={label} className={SUBGRID}>
      <div role="rowgroup" className={SUBGRID}>
        <div role="row" className={cn(SUBGRID, "label draw-b items-baseline pb-2 max-md:sr-only")}>
          <span role="columnheader" className={cn(cells.index, "muted")}>
            No.
          </span>
          <span role="columnheader" className={cn(cells.name, "muted")}>
            Name
          </span>
          <span role="columnheader" className={cn(cells.size, "muted md:text-right")}>
            Size
          </span>
          <span role="columnheader" className={cn(cells.trailing, "muted text-right")}>
            {trailingLabel}
          </span>
        </div>
      </div>
      <div role="rowgroup" className={SUBGRID}>
        {children}
      </div>
    </div>
  );
}

interface FileRowProps extends Omit<HTMLMotionProps<"div">, "children"> {
  index: number;
  name: string;
  size: number;
  columns?: Columns;
  /**
   * Plain status text for the last column. Prefer this over `children` for
   * rows that re-render often: primitives let `memo` skip unchanged rows.
   */
  status?: string;
  statusTone?: "normal" | "muted" | "strong";
  /** An action for the last column. */
  children?: ReactNode;
}

export const FileRow = memo(function FileRow({
  index,
  name,
  size,
  columns = "wide",
  status,
  statusTone = "normal",
  className,
  children,
  ...props
}: FileRowProps) {
  const cells = CELLS[columns];
  return (
    <motion.div role="row" className={cn(SUBGRID, "rule-b items-baseline gap-y-1 py-3", className)} {...props}>
      <span role="cell" className={cn(cells.index, "label tabular muted")}>
        {rowNumber(index)}
      </span>
      <span role="cell" className={cn(cells.name, "truncate")} title={name}>
        {name}
      </span>
      <span
        role="cell"
        className={cn(cells.size, "tabular whitespace-nowrap max-md:text-sm max-md:opacity-60 md:justify-self-end")}
      >
        {formatBytes(size)}
      </span>
      <span role="cell" className={cn(cells.trailing, "justify-self-end whitespace-nowrap text-right")}>
        {status !== undefined ? (
          <span className={cn("label tabular", statusTone === "muted" && "muted", statusTone === "strong" && "font-bold")}>
            {status}
          </span>
        ) : (
          children
        )}
      </span>
    </motion.div>
  );
});
