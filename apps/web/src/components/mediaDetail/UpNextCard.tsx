import { Play } from "lucide-react";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import type { QueueItem } from "@/lib/queue";

/** The "Up next" card shown over the last stretch of a video when something is queued. */
export function UpNextCard({
  item,
  onPlayNext,
}: {
  item: QueueItem;
  onPlayNext: () => void;
}) {
  return (
    <div className="absolute bottom-24 right-4 z-20 flex w-[min(20rem,calc(100%-2rem))] items-center gap-3 rounded-lg bg-black/85 p-2.5 text-white shadow-xl ring-1 ring-white/15 backdrop-blur-md">
      <img
        src={thumbnailUrl(item)}
        alt=""
        className="size-16 shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
          Up next
        </p>
        <p className="mt-1 truncate text-sm font-medium">
          {item.title}
        </p>
        <button
          type="button"
          onClick={onPlayNext}
          className="mt-2 flex items-center gap-1.5 text-xs font-medium text-white/80 hover:text-white"
        >
          <Play className="size-3.5 fill-current" /> Play next
        </button>
      </div>
    </div>
  );
}
