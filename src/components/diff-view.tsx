"use client";

import { diffWords } from "diff";
import { cn } from "@/lib/utils";

/**
 * Word-level diff from `before` → `after`. Removed text (present in before, gone in
 * after) is struck through in red; added text (new in after) is green. Used to show
 * a customer how the internal version differs from theirs on a conflicting field.
 */
export function DiffView({
  before,
  after,
  className,
}: {
  before: string;
  after: string;
  className?: string;
}) {
  const parts = diffWords(before, after);
  return (
    <pre
      className={cn(
        "whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed",
        className,
      )}
    >
      {parts.map((part, i) => (
        <span
          key={`${i}:${part.value}`}
          className={cn(
            part.added &&
              "rounded bg-green-500/20 text-green-700 dark:text-green-300",
            part.removed &&
              "rounded bg-red-500/20 text-red-700 line-through dark:text-red-300",
          )}
        >
          {part.value}
        </span>
      ))}
    </pre>
  );
}
