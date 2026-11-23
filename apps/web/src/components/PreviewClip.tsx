// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The preview clip over the poster: muted, looping, and faded in only once
 * it is actually playing, so the still never blinks to black while it loads.
 */
export function PreviewClip({ itemId }: { itemId: number }) {
  const [ready, setReady] = useState(false);
  return (
    <video
      src={`/api/media-items/${itemId}/preview`}
      muted
      loop
      autoPlay
      playsInline
      onPlaying={() => setReady(true)}
      className={cn(
        "sensitive absolute inset-0 size-full object-cover transition-opacity duration-300",
        ready ? "opacity-100" : "opacity-0",
      )}
    />
  );
}
