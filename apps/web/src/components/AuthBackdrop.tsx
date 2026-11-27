// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/lib/utils";

/**
 * The look of the screens you see before you're in: a film still with no
 * film in it — a dusk of deep crimson into violet, one warm light leak across
 * it, grain, and a vignette — so the door to the library feels like the
 * opening frame of something rather than a form on a black page.
 *
 * Deliberately no pictures from the library. Nothing can be fetched before
 * sign-in anyway, and this is the screen most likely to be seen by someone
 * looking over your shoulder.
 */
function CinemaArt({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none overflow-hidden bg-[#07040a]", className)}>
      {/* The dusk: crimson low on one side, violet high on the other. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_15%_100%,#5c0a2e_0%,transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_90%_0%,#3b0f63_0%,transparent_65%)]" />
      {/* A warm light leak raking across the frame. */}
      <div className="absolute -inset-x-1/4 top-[30%] h-[45%] -rotate-12 bg-gradient-to-r from-transparent via-[#ff2d95]/25 to-transparent blur-3xl" />
      <div className="absolute -inset-x-1/4 top-[42%] h-[6%] -rotate-12 bg-gradient-to-r from-transparent via-[#ffb3d9]/20 to-transparent blur-xl" />
      {/* Grain over everything, then the vignette that frames it. */}
      <div className="film-grain absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(0_0_0/0.85))]" />
    </div>
  );
}

/** The full-screen form, dimmed, behind the profile picker and the unlock screen. */
export function AuthBackdrop() {
  return <CinemaArt className="fixed inset-0 opacity-70" />;
}

/**
 * The poster half of the sign-in screen: the art edge to edge, with the
 * title set low on it like a film's credit block.
 */
export function CinemaPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex flex-col justify-end overflow-hidden">
      <CinemaArt className="absolute inset-0 -z-10" />
      {/* Letterbox: a hairline at top and bottom, as on a projected frame. */}
      <span aria-hidden className="absolute inset-x-0 top-6 h-px bg-white/10" />
      <span aria-hidden className="absolute inset-x-0 bottom-6 h-px bg-white/10" />
      {children}
    </div>
  );
}
