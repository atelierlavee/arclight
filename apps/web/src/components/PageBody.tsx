// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/lib/utils";

/**
 * The content under a page's header, with the same gutters and top spacing
 * on every list page, so moving between pages doesn't shift where things
 * start. Left-aligned like the header above it; `width` caps how wide a
 * reading page gets without centring it away from its own title.
 */
export function PageBody({
  width = "full",
  className,
  children,
}: {
  width?: "full" | "wide" | "reading";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-full px-4 py-6 md:px-6 md:py-8",
        width === "wide" && "max-w-5xl",
        width === "reading" && "max-w-3xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
