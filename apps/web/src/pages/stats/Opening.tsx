import type React from "react";
import { useAppearance } from "@/lib/appearance";
import type { InsightItem } from "@/lib/insights";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { greeting, openingFigure } from "./statsData";
import { useCountUp } from "./useCountUp";

/**
 * The first screen: your #1 video's poster, heavily blurred, as a backdrop,
 * one giant number, a sentence, and four figures in a ruled row.
 */
export function Opening({
  name,
  backdrop,
  total,
  videos,
  performers,
  studios,
  figures,
  hasHistory,
}: {
  name: string | null;
  backdrop: InsightItem | null;
  total: number;
  videos: number;
  performers: number;
  studios: number;
  figures: { label: string; value: string }[];
  hasHistory: boolean;
}) {
  const { discreet } = useAppearance();
  const shown = useCountUp(total);
  const { big, unit } = openingFigure(total, shown);

  return (
    <header className="relative isolate overflow-hidden">
      {backdrop && !discreet && (
        <img
          src={thumbnailUrl(backdrop)}
          alt=""
          aria-hidden
          className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/70 to-background" />

      <div className="mx-auto max-w-[1320px] px-4 pb-12 pt-14 md:px-8 md:pt-20">
        <p className="text-sm text-muted-foreground">
          {greeting()}
          {name && <span className="sensitive">, {name}</span>} · your viewing, looked back on
        </p>

        {hasHistory ? (
          <>
            <h1 className="mt-4 flex items-baseline gap-4 font-black tracking-tighter">
              <span className="text-7xl tabular-nums sm:text-8xl lg:text-9xl">{big}</span>
              <span className="text-3xl text-muted-foreground sm:text-4xl">{unit}</span>
            </h1>
            <p className="mt-3 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              of watching, across <Em>{videos}</Em> {videos === 1 ? "video" : "videos"}
              {performers > 0 && (
                <>
                  , <Em>{performers}</Em> {performers === 1 ? "performer" : "performers"}
                </>
              )}
              {studios > 0 && (
                <>
                  {" "}and <Em>{studios}</Em> {studios === 1 ? "studio" : "studios"}
                </>
              )}
              .
            </p>
            <dl className="mt-10 grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
              {figures.map((figure) => (
                <div key={figure.label} className="py-3 sm:px-6 sm:first:pl-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{figure.label}</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{figure.value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <>
            <h1 className="mt-4 max-w-3xl text-5xl font-black tracking-tighter sm:text-7xl">Your story starts here.</h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              Watch, finish and rate videos and this page writes itself — a podium, a year in squares, your
              habits and a shelf of trophies.
            </p>
          </>
        )}
      </div>
    </header>
  );
}

const Em = ({ children }: { children: React.ReactNode }) => (
  <span className="font-semibold text-foreground tabular-nums">{children}</span>
);
