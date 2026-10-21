import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { useAppearance } from "@/lib/appearance";
import { formatWatchTime, type Insights } from "@/lib/insights";
import { fetchItem, thumbnailUrl } from "@/lib/mediaItemApi";
import { circleStyle, performerPortraitUrl } from "@/lib/performerApi";
import { numberOneFacts, numberOneTrivia } from "./statsData";
import type { Headline } from "./useHeadline";

/**
 * The #1 video: its preview drifting slowly (Ken Burns) under a black wash,
 * everything centred on top — a shining gold pill, the title, who's in it,
 * its studio, how often and how long you've watched it, and a line of
 * trivia. Clicking it plays, resuming where you left off. A burst of gold confetti
 * greets it once when the page opens. Moving parts all stand down in
 * discreet mode or with animation turned off.
 */
export function NumberOne({
  headline,
  data,
  onPlay,
}: {
  headline: NonNullable<Headline>;
  data: Insights;
  onPlay: (id: number, resume?: boolean) => void;
}) {
  const { discreet, motion } = useAppearance();
  const navigate = useNavigate();
  const { item, seconds } = headline;
  const moving = !discreet && motion !== "none";
  const lively = !discreet && motion === "full";
  // The item itself, for who's in it, its studio, year and resume position.
  // Shares its cache entry with the pinned-video lookup.
  const { data: detail } = useQuery({
    queryKey: ["media-item", item.id],
    queryFn: () => fetchItem(item.id),
    retry: false,
  });

  const trivia = useMemo(() => numberOneTrivia(data, item.id, seconds), [data, item.id, seconds]);

  const people = (detail?.performers ?? []).map((p) => ({
    ...p,
    known: data.performers.find((known) => known.id === p.id),
  }));
  const canResume = (detail?.lastPositionSeconds ?? 0) > 15 && !detail?.watched;

  const facts = numberOneFacts(trivia);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPlay(item.id, canResume)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPlay(item.id, canResume);
        }
      }}
      className="group relative block min-h-[26rem] w-full flex-1 cursor-pointer overflow-hidden rounded-3xl text-left shadow-[0_0_60px_-10px_rgba(245,158,11,0.6)] ring-2 ring-amber-400/70 outline-none focus-visible:ring-4 lg:min-h-[38rem]"
    >
      <div className="absolute inset-0" style={lively ? { animation: "kenburns 24s ease-in-out infinite alternate" } : undefined}>
        <img src={thumbnailUrl(item)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {moving && (
          <video
            src={`/api/media-items/${item.id}/preview`}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      {/* An even black wash, so the centred text reads over any frame. */}
      <div className="absolute inset-0 bg-black/65" />
      {lively && <Confetti />}

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white sm:p-10">
        <span className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-amber-200 to-amber-500 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-950 shadow-lg shadow-amber-500/40">
          <Trophy className="size-3.5" />
          #1 of all time
          {lively && (
            <span
              aria-hidden
              className="absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent"
              style={{ animation: "pill-shine 3.5s ease-in-out infinite" }}
            />
          )}
        </span>

        <h3 className="sensitive line-clamp-2 max-w-4xl text-5xl font-black tracking-tight drop-shadow sm:text-7xl">{item.title}</h3>

        {people.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {people.map((p) => {
              const src = p.known ? performerPortraitUrl(p.known) : null;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void navigate({ to: "/performer/$performerId", params: { performerId: String(p.id) } });
                  }}
                  className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-sm ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-white/20"
                >
                  <span className="size-7 overflow-hidden rounded-full bg-white/15 ring-1 ring-amber-300/60">
                    {src ? (
                      <img src={src} alt="" style={p.known ? circleStyle(p.known) : undefined} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs font-bold">{p.name[0]}</span>
                    )}
                  </span>
                  <span className="sensitive">{p.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {detail?.studio && (
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">{detail.studio}</p>
        )}

        {(seconds >= 60 || item.playCount > 0) && (
          <dl className="mt-1 flex flex-wrap items-end justify-center gap-x-10 gap-y-3">
            {item.playCount > 0 && <BigFigure label="Times played" value={`${item.playCount}×`} />}
            {seconds >= 60 && <BigFigure label="Time watched" value={formatWatchTime(seconds)} />}
          </dl>
        )}


        {facts.length > 0 && <p className="text-sm text-white/70">{facts.join(" · ")}</p>}

      </div>
    </div>
  );
}

function BigFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="text-3xl font-black tabular-nums tracking-tight text-amber-200 sm:text-4xl">{value}</dd>
      <dt className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white/60">{label}</dt>
    </div>
  );
}

/** A one-off burst of gold confetti when the tile first appears. */
function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      left: 50 + (Math.random() - 0.5) * 70,
      dx: (Math.random() - 0.5) * 520,
      dy: -(140 + Math.random() * 260),
      rotate: Math.random() * 720 - 360,
      delay: Math.random() * 180,
      size: 5 + Math.random() * 6,
      tone: ["#fde68a", "#fbbf24", "#f59e0b", "#fff7d6"][i % 4],
    })),
  );
  const [done, setDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), 2600);
    return () => clearTimeout(timer);
  }, []);
  if (done) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute bottom-1/3 rounded-[2px]"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.45,
              background: p.tone,
              animation: `confetti-burst 2.2s cubic-bezier(0.2, 0.7, 0.3, 1) ${p.delay}ms forwards`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
