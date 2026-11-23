// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import type React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Circular performer portrait.
 *
 * A video-frame source can 404 — poster existence is a filesystem check, not
 * a DB fact — so a failed load falls back to the initial rather than leaving
 * a broken image. Same approach MediaCard already takes for thumbnails.
 */
export function PerformerAvatar({
  name,
  src,
  framing,
  className,
  fallbackClassName,
}: {
  name: string;
  /** Resolve with performerPortraitUrl so every caller agrees on the image. */
  src: string | null | undefined;
  /** Portrait framing from the performer record, if the caller has it. */
  framing?: React.CSSProperties;
  className?: string;
  fallbackClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = src != null && !imageFailed;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-full bg-secondary ring-1 ring-border",
        className
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          // Posters are 16:9 and this frame is square, so the sides crop away.
          // The framing defaults to top-aligned for the same reason the class
          // used to hardcode `object-top`: faces are usually up there.
          style={framing}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center font-semibold text-muted-foreground",
            fallbackClassName
          )}
        >
          {name.trim()[0]?.toUpperCase() ?? "?"}
        </div>
      )}
    </div>
  );
}
