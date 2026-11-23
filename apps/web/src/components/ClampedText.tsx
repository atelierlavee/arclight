// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Long prose, cut to a few lines with a way to see the rest.
 *
 * Descriptions here are scraped from wherever the file came from and run to
 * any length — a synopsis can push everything else on a page below the fold
 * before you have decided you care about it.
 *
 * The toggle only appears when the text actually overflows, measured rather
 * than guessed from a character count: whether the limit is reached depends on
 * the column width, and a "Read more" that reveals nothing is worse than none.
 */
export function ClampedText({
  text,
  lines = 5,
  className,
}: {
  text: string;
  lines?: number;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Only meaningful while clamped — expanded, the two heights are equal by
    // definition, and measuring then would hide the button that collapses it.
    const measure = () => {
      if (expanded) return;
      setOverflows(node.scrollHeight > node.clientHeight + 1);
    };

    measure();
    // Re-measured on resize because the line count depends on how wide the
    // column is, not on how long the string is.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, lines, expanded]);

  return (
    <div className="space-y-1">
      <p
        ref={ref}
        className={cn("whitespace-pre-wrap", className)}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lines,
                overflow: "hidden",
              }
        }
      >
        {text}
      </p>

      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
