// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { cn } from "@/lib/utils";

/**
 * A soft glow around the player that takes on the colours on screen, the
 * way an Ambilight TV washes the wall behind it. It sits just behind the
 * video and spills past its edges, so it follows the player rather than
 * tinting the whole page.
 *
 * The video is copied a few times a second into a canvas a few dozen pixels
 * wide, and that canvas is stretched a little past the player and blurred
 * heavily. The tiny size does the averaging for free: each of its pixels is
 * already the mean of a large patch of the frame, so no colour maths runs in
 * script at all. The left of the screen glows with the left of the picture,
 * the top with the top, and so on.
 *
 * Sampling is throttled rather than per frame: the glow is blurred so far
 * that faster updates can't be seen, only paid for.
 */
// Coarse on purpose: the fewer the samples, the more each one averages, and
// the glow reads as light rather than as a blurry copy of the picture.
const SAMPLE_WIDTH = 12;
const SAMPLE_HEIGHT = 7;
const SAMPLE_EVERY_MS = 120;

export function AmbientLight({
  videoRef,
  active,
  onLitChange,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  /**
   * Whether the glow is actually showing — switched on and a frame drawn —
   * so whatever stands in for it can stay until it really takes over.
   */
  onLitChange?: (lit: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Only shown once a frame has actually been drawn, so opening a video
  // never flashes a black rectangle across the backdrop.
  const [lit, setLit] = useState(false);
  const showing = active && lit;

  // Switched off, the next time it comes on has to draw a frame again
  // before it counts as showing.
  useEffect(() => {
    if (!active) setLit(false);
  }, [active]);

  useEffect(() => {
    onLitChange?.(showing);
  }, [showing, onLitChange]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: false });
    if (!canvas || !ctx) return;
    let frame = 0;
    let last = 0;
    let drewOnce = false;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < SAMPLE_EVERY_MS) return;
      last = now;
      const video = videoRef.current;
      // Skipped while paused (the last frame's glow simply stays) and until
      // there is a decoded frame to copy.
      if (!video || video.readyState < 2 || (video.paused && drewOnce)) return;
      try {
        ctx.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        if (!drewOnce) {
          drewOnce = true;
          setLit(true);
        }
      } catch {
        // A cast session or a stream the canvas may not read: no glow,
        // and nothing else is affected.
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      width={SAMPLE_WIDTH}
      height={SAMPLE_HEIGHT}
      aria-hidden
      className={cn(
        // Well above and below the player, so the light fills the room
        // rather than ringing the screen. Sized explicitly: a canvas keeps
        // its own pixel size unless told otherwise.
        // Wider than the window, so the blur's own fade at the canvas edges
        // always falls off-screen instead of showing as a dark band.
        "pointer-events-none absolute left-1/2 top-[-40%] h-[240%] w-[160vw] -translate-x-1/2 transition-opacity duration-700",
        active && lit ? "opacity-75" : "opacity-0",
      )}
      style={{
        filter: "blur(90px) saturate(1.5)",
        // Even across the whole width; it only fades out downwards, well
        // below the title, rather than in an oval with a visible rim.
        maskImage: "linear-gradient(to bottom, black 0%, black 60%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 60%, transparent 100%)",
      }}
    />
  );
}
