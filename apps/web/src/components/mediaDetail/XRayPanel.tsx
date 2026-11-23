// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Performer } from "@/lib/mediaItemApi";
import { fetchPerformer, performerPortraitUrl, portraitStyle } from "@/lib/performerApi";
import type { PerformerSummary } from "../PerformerCard";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

async function fetchPerformers(): Promise<{ performers: PerformerSummary[] }> {
  const res = await fetch("/api/performers");
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

/**
 * Who is in the scene, over the video itself — like a streaming service's
 * X-Ray. It comes and goes with the player's controls, so it is there when
 * you reach for the video and out of the way while you watch. A face opens
 * that performer's page.
 */
/**
 * A few lines about a performer under their name: where they're from, their
 * height and hair, and how many of their videos you have. From their page's
 * own data, so it is shared with it rather than fetched twice.
 */
function PerformerFacts({ id }: { id: number }) {
  const { data } = useQuery({ queryKey: qk.performer.detail(id), queryFn: () => fetchPerformer(id) });
  if (!data) return null;
  const looks = [data.country, data.heightCm ? `${data.heightCm} cm` : null, data.hairColor].filter(Boolean);
  return (
    <span className="mt-1 block space-y-1 text-[11px] leading-snug text-white/60">
      {looks.length > 0 && <span className="sensitive block">{looks.join(" · ")}</span>}
      <span className="block font-mono uppercase tracking-[0.15em] text-primary">
        {data.videoCount} {data.videoCount === 1 ? "video" : "videos"}
      </span>
    </span>
  );
}

export function XRayPanel({ performers, visible }: { performers: Performer[]; visible: boolean }) {
  const navigate = useNavigate();
  // The same list every performer picture reads, so this costs no request.
  const { data } = useQuery({ queryKey: qk.performers.all, queryFn: fetchPerformers });
  const byId = new Map((data?.performers ?? []).map((performer) => [performer.id, performer]));
  if (performers.length === 0) return null;

  return (
    <div
      className={cn(
        // A strip down the left edge, the full height of the video, the
        // picture darkening behind it; clear of the toolbar at the top and the
        // controls at the bottom.
        "absolute inset-y-0 left-0 z-30 flex w-64 flex-col bg-gradient-to-r from-black/85 via-black/60 to-transparent pb-24 pl-4 pr-6 pt-24 md:pt-28 transition-all duration-300 md:w-72 md:pl-6",
        visible ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-3 opacity-0",
      )}
    >
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">In this scene</p>
      <ul className="scrollbar-hide min-h-0 flex-1 space-y-4 overflow-y-auto">
        {performers.map((performer) => {
          const summary = byId.get(performer.id);
          const portrait = summary ? performerPortraitUrl(summary) : null;
          return (
            <li key={performer.id}>
              <button
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/performer/$performerId",
                    params: { performerId: String(performer.id) },
                  })
                }
                className="group flex w-full items-start gap-3 rounded-lg bg-black/60 p-2 text-left ring-1 ring-white/10 backdrop-blur-md transition-colors hover:bg-black/75"
              >
                {/* Their whole portrait, not a circle cropped out of it. */}
                <span className="block aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md bg-secondary ring-1 ring-white/20 transition-all group-hover:ring-2 group-hover:ring-primary">
                  {portrait ? (
                    <img
                      src={portrait}
                      alt=""
                      style={portraitStyle(summary!)}
                      className="sensitive size-full object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-2xl font-black text-muted-foreground">
                      {performer.name.trim()[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </span>
                {/* Name and details beside the portrait. */}
                <span className="min-w-0 flex-1 pt-1">
                  <span className="sensitive line-clamp-2 block text-sm font-semibold leading-snug text-white transition-colors group-hover:text-primary">
                    {performer.name}
                  </span>
                  <PerformerFacts id={performer.id} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
