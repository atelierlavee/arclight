// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useRef, useState } from "react";
import { Dices, Play } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import type { CareerItem } from "@/lib/career";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/lib/appearance";
import { PreviewClip } from "./PreviewClip";

async function fetchCareer(id: number): Promise<{ birthdate: string | null; items: CareerItem[] }> {
  const res = await fetch(`/api/performers/${id}/career`);
  if (!res.ok) throw new Error(`Failed to load the career: ${res.status}`);
  return res.json();
}

/** A copy in random order (Fisher–Yates). */
function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** How long a spin takes, and how many times round it goes before slowing. */
const SPIN_MS = 3200;
const SPIN_LAPS = 2;

/**
 * Roulette: every one of a performer's videos, shuffled and sliced thin
 * into one strip. Hover along it and the video under the pointer comes up
 * large above it, its clip playing behind the section; a click opens it.
 * Spin sends the playhead racing round the strip, slowing to a stop on a
 * random video, which then plays.
 */
export function PerformerCareer({
  performerId,
  onSelect,
}: {
  performerId: number;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const { data } = useQuery({
    queryKey: qk.performerCareer.detail(performerId),
    queryFn: () => fetchCareer(performerId),
  });
  // A fresh shuffle each visit, and again with every spin.
  const firstOrder = useMemo(() => shuffled(data?.items ?? []), [data]);
  const [wheel, setWheel] = useState<CareerItem[] | null>(null);
  const strip = wheel ?? firstOrder;

  const [spinning, setSpinning] = useState(false);
  // Where the last spin stopped, and where the pointer is on the strip.
  const [landedAt, setLandedAt] = useState<number | null>(null);
  const [pointerAt, setPointerAt] = useState<number | null>(null);
  const [spinAt, setSpinAt] = useState(0);
  const [restAt] = useState(() => Math.random());
  const frame = useRef<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const { hoverPreview, discreet, motion } = useAppearance();

  // A spin still running when the section goes away stops with it.
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  if (strip.length === 0) return null;

  function spin() {
    if (spinning) return;
    const order = shuffled(data?.items ?? strip);
    setWheel(order);
    setPointerAt(null);
    setLandedAt(null);
    const target = Math.floor(Math.random() * order.length);
    // With less motion asked for, it simply lands.
    if (motion !== "full" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLandedAt(target);
      onSelect(order[target].id, true);
      return;
    }
    setSpinning(true);
    const distance = SPIN_LAPS * order.length + target;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SPIN_MS);
      // Fast, then easing to a stop.
      const eased = 1 - Math.pow(1 - t, 4);
      setSpinAt(Math.floor(eased * distance) % order.length);
      if (t < 1) frame.current = requestAnimationFrame(step);
      else {
        frame.current = null;
        setSpinning(false);
        setLandedAt(target);
        // Where it stops, it plays.
        onSelect(order[target].id, true);
      }
    };
    frame.current = requestAnimationFrame(step);
  }

  // Mid-spin, the spin; under the pointer, that; else where it landed, or
  // somewhere random on a first visit.
  const index = Math.min(
    spinning ? spinAt : (pointerAt ?? landedAt ?? Math.floor(restAt * strip.length)),
    strip.length - 1,
  );
  const item = strip[index];
  const at = (index + 0.5) / strip.length;
  const landed = !spinning && pointerAt === null && landedAt !== null;

  const indexAt = (clientX: number) => {
    const box = stripRef.current?.getBoundingClientRect();
    if (!box) return null;
    const fraction = Math.min(0.9999, Math.max(0, (clientX - box.left) / box.width));
    return Math.floor(fraction * strip.length);
  };

  return (
    <section className="relative isolate space-y-6">
      {/* Behind it all: the video in focus, dimmed, its clip playing. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -inset-y-12 -z-10 overflow-hidden">
        <div className="absolute inset-0 opacity-35 blur-[1px] saturate-125">
          <img
            key={item.id}
            src={thumbnailUrl(item)}
            alt=""
            className="sensitive animate-fade-in absolute inset-0 size-full object-cover"
          />
          {/* Not mid-spin: it would start a new clip for every video it passes. */}
          {hoverPreview && !discreet && !spinning && <PreviewClip key={`clip-${item.id}`} itemId={item.id} />}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background" />
      </div>

      <div className="space-y-3">
        <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-primary">
          <span className="h-px w-8 bg-primary/60" />
          Roulette
        </h2>
        <p className="text-sm text-muted-foreground">Spin, and let fate pick tonight&rsquo;s scene.</p>
      </div>

      <div>
        {/* The video in focus, large, riding above its place on the strip. */}
        <div className="relative h-56 md:h-64">
          <button
            type="button"
            onClick={() => onSelect(item.id, landed)}
            className={cn(
              "group absolute bottom-3 w-72 -translate-x-1/2 text-left ease-out md:w-96",
              !spinning && "transition-[left] duration-150",
            )}
            style={{ left: `clamp(9rem, ${at * 100}%, calc(100% - 9rem))` }}
          >
            <span className="relative block aspect-video overflow-hidden rounded-sm bg-secondary shadow-[0_24px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-primary/50">
              <img
                key={item.id}
                src={thumbnailUrl(item)}
                alt=""
                style={framingStyle(item)}
                className="sensitive size-full object-cover"
              />
              {landed && (
                <span className="absolute inset-0 flex animate-fade-in items-center justify-center">
                  <span className="flex size-14 items-center justify-center rounded-full bg-white text-black shadow-[0_0_30px_rgba(255,45,149,0.7)]">
                    <Play className="ml-0.5 size-6 fill-current" />
                  </span>
                </span>
              )}
            </span>
            <span className="mt-2 flex items-baseline gap-2">
              {item.releaseDate && (
                <span className="font-mono text-sm font-bold tabular-nums text-primary">
                  {item.releaseDate.slice(0, 4)}
                </span>
              )}
              <span className="sensitive truncate text-sm font-semibold group-hover:text-primary">
                {item.title}
              </span>
            </span>
          </button>
        </div>

        {/* The strip: every video, shuffled, sliced thin. */}
        <div
          ref={stripRef}
          role="slider"
          tabIndex={0}
          aria-label="Roulette"
          aria-valuemin={0}
          aria-valuemax={strip.length - 1}
          aria-valuenow={index}
          aria-valuetext={item.title}
          onPointerMove={(event) => !spinning && setPointerAt(indexAt(event.clientX))}
          onPointerLeave={() => setPointerAt(null)}
          onClick={(event) => {
            if (spinning) return;
            const n = indexAt(event.clientX);
            if (n !== null) onSelect(strip[n].id, false);
          }}
          onKeyDown={(event) => {
            if (spinning) return;
            if (event.key === "ArrowRight") setPointerAt(Math.min(strip.length - 1, index + 1));
            else if (event.key === "ArrowLeft") setPointerAt(Math.max(0, index - 1));
            else if (event.key === "Enter") onSelect(item.id, false);
          }}
          className="relative flex h-16 cursor-pointer overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary md:h-20"
        >
          {strip.map((video, n) => (
            <span
              key={video.id}
              className={cn(
                "sensitive h-full min-w-0 flex-1 bg-cover bg-center transition-opacity duration-150",
                n === index ? "opacity-100" : "opacity-45",
              )}
              style={{ backgroundImage: `url(${thumbnailUrl(video)})` }}
            />
          ))}
          {/* The playhead. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary shadow-[0_0_10px_var(--primary)]",
              !spinning && "transition-[left] duration-150 ease-out",
            )}
            style={{ left: `${at * 100}%` }}
          />
        </div>

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={spin}
            disabled={spinning}
            className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold uppercase tracking-[0.2em] text-white shadow-[0_0_30px_-6px_rgba(255,45,149,0.8)] transition-transform hover:scale-105 disabled:opacity-70"
          >
            <Dices className={cn("size-4", spinning && "animate-spin")} />
            {spinning ? "Spinning…" : landedAt !== null ? "Spin again" : "Spin"}
          </button>
        </div>
      </div>
    </section>
  );
}
