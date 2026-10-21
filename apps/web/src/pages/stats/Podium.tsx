import { useNavigate } from "@tanstack/react-router";
import { Medal, Repeat, Star, type LucideIcon } from "lucide-react";
import { useAppearance } from "@/lib/appearance";
import type { hallOfFame, Insights, InsightItem } from "@/lib/insights";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { circleStyle, performerPortraitUrl } from "@/lib/performerApi";
import { cn } from "@/lib/utils";
import { NumberOne } from "./NumberOne";
import { podiumTop, type PodiumPlace } from "./statsData";
import type { Headline } from "./useHeadline";

const MEDALS = [
  "bg-gradient-to-br from-amber-200 to-amber-500 text-amber-950",
  "bg-gradient-to-br from-slate-100 to-slate-400 text-slate-900",
  "bg-gradient-to-br from-orange-300 to-orange-700 text-orange-950",
];

export function Podium({
  data,
  hall,
  headline,
  onOpenItem,
  onPlayItem,
}: {
  data: Insights;
  hall: ReturnType<typeof hallOfFame>;
  headline: Headline;
  onOpenItem: (id: number) => void;
  onPlayItem: (id: number, resume?: boolean) => void;
}) {
  const { set } = useAppearance();
  // Top three by time watched; while there's too little history to fill
  // the podium, the rest of the places go to whoever has the most videos.
  const top = podiumTop(hall, data.performers);
  const played = hall.videosByPlays.slice(0, 5);
  const rated = hall.videosByRating.slice(0, 5);

  if (!headline && top.length === 0 && played.length === 0 && rated.length === 0) {
    return (
      <p className="max-w-xl text-muted-foreground">
        Nobody on the podium yet. Watch and finish videos and your favourites take their places — or pin any
        video as your #1 with the trophy button in its details.
      </p>
    );
  }

  return (
    <div className="space-y-12">
      {/* The #1 video on its own row, full width; the podium and the two
          ranked lists share the row beneath it. */}
      {headline && (
        <div className="flex flex-col gap-2">
          <NumberOne headline={headline} data={data} onPlay={onPlayItem} />
          {headline.isPinned && (
            <button
              type="button"
              onClick={() => set({ hallOfFamePin: 0 })}
              className="self-end text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Unpin — go back to your most-watched video
            </button>
          )}
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-3">
        {top.length > 0 && <PerformerPodium top={top} />}
        <RankedList title="Most played" icon={Repeat} items={played} detail={(i) => `${i.playCount}×`} onOpen={onOpenItem} />
        <RankedList title="Highest rated" icon={Star} items={rated} detail={(i) => "★".repeat(i.rating ?? 0)} onOpen={onOpenItem} />
      </div>
    </div>
  );
}

/** Top three performers on an actual podium: 2 · 1 · 3, steps of three heights. */
function PerformerPodium({ top }: { top: PodiumPlace[] }) {
  const navigate = useNavigate();
  const order = [1, 0, 2].filter((i) => top[i]);
  const heights = ["h-24", "h-16", "h-12"];
  return (
    <div className="flex flex-col">
      <p className="mb-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        <Medal className="size-3.5 text-amber-400" />
        Top performers
      </p>
      <div className="mt-auto flex items-end justify-center gap-1.5">
        {order.map((place) => {
          const { performer, detail } = top[place];
          const src = performerPortraitUrl(performer);
          return (
            <button
              key={performer.id}
              type="button"
              onClick={() => void navigate({ to: "/performer/$performerId", params: { performerId: String(performer.id) } })}
              className="group flex w-1/3 min-w-0 flex-col items-center text-center"
            >
              <span
                className={cn(
                  "mb-2 block overflow-hidden rounded-full bg-secondary ring-[3px] transition-transform group-hover:scale-105",
                  place === 0 ? "size-16 ring-amber-400/80" : "size-12 ring-border",
                )}
              >
                {src && <img src={src} alt="" style={circleStyle(performer)} className="h-full w-full object-cover" />}
              </span>
              <span className="sensitive line-clamp-1 max-w-full text-xs font-semibold">{performer.name}</span>
              <span className="mb-2 text-[10px] text-muted-foreground">{detail}</span>
              <span
                className={cn(
                  "flex w-full items-start justify-center rounded-t-lg pt-1.5 text-lg font-black",
                  heights[place],
                  MEDALS[place],
                )}
              >
                {place + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RankedList({
  title,
  icon: Icon,
  items,
  detail,
  onOpen,
}: {
  title: string;
  icon: LucideIcon;
  items: InsightItem[];
  detail: (item: InsightItem) => string;
  onOpen: (id: number) => void;
}) {
  return (
    <div>
      <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        <Icon className="size-3.5 text-amber-400" />
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground/70">Nothing yet.</p>
      ) : (
        <ol className="divide-y divide-border">
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="group flex w-full items-center gap-4 py-3 text-left"
              >
                <span
                  className={cn(
                    "w-6 text-center font-mono text-lg font-bold tabular-nums",
                    i === 0 ? "text-amber-300" : "text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <img
                  src={thumbnailUrl(item)}
                  alt=""
                  className="aspect-video w-20 shrink-0 rounded-md object-cover ring-1 ring-border transition-transform group-hover:scale-[1.03]"
                />
                <span className="sensitive min-w-0 flex-1 truncate font-medium group-hover:underline">{item.title}</span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{detail(item)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
