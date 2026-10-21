import { useQuery } from "@tanstack/react-query";
import { Dices, Play, RotateCcw } from "lucide-react";
import { useQueue, type QueueItem } from "@/lib/queue";
import type { MediaCardItem } from "./MediaCard";
import type { GridSource } from "./MediaGrid";
import { qk } from "@/lib/queryKeys";

const MIN_RESUMABLE_SECONDS = 15;
const PLAY_EVENT = "media-server:play-item";

type PageItem = Pick<
  MediaCardItem,
  "id" | "title" | "thumbnailFile" | "durationSeconds" | "itemType"
> & {
  lastPositionSeconds?: number;
};

type Response = {
  items: PageItem[];
  page: number;
  pageSize: number;
  hasMore?: boolean;
};

async function fetchPage(source: GridSource, page: number): Promise<Response> {
  if (source.type === "collection") {
    const response = await fetch(
      `/api/collections/${source.id}/items?page=${page}`,
    );
    if (!response.ok)
      throw new Error(`Failed to load collection: ${response.status}`);
    return response.json();
  }

  const params = new URLSearchParams({ page: String(page), sort: "newest" });
  if (source.tag) params.set("tag", source.tag);
  if (source.performer) params.set("performer", source.performer);
  if (source.studio) params.set("studio", source.studio);
  if (source.kind) params.set("kind", source.kind);
  if (source.q) params.set("q", source.q);
  if (source.parentId !== null) params.set("parentId", String(source.parentId));
  const response = await fetch(`/api/media-items?${params}`);
  if (!response.ok) throw new Error(`Failed to load media: ${response.status}`);
  return response.json();
}

export function PlaySurface({
  source,
  items: directItems,
  label = "Play surface",
}: {
  source?: GridSource;
  items?: PageItem[];
  label?: string;
}) {
  const { add, clear } = useQueue();
  const { data, isLoading } = useQuery({
    queryKey: qk.playSurface.list(source, directItems?.map((item) => item.id)),
    queryFn: async () => {
      if (directItems) return directItems;
      if (!source) return [];
      const all: PageItem[] = [];
      let page = 1;
      while (true) {
        const response = await fetchPage(source, page);
        all.push(...response.items);
        const hasMore =
          response.hasMore ?? response.items.length === response.pageSize;
        if (!hasMore) return all;
        page += 1;
      }
    },
    enabled: Boolean(source || directItems),
    staleTime: 30_000,
  });

  const videos = (data ?? []).filter((item) => item.itemType === "video");
  const resumeItem = videos.find(
    (item) =>
      (item.lastPositionSeconds ?? 0) > MIN_RESUMABLE_SECONDS &&
      (item.durationSeconds == null ||
        (item.lastPositionSeconds ?? 0) <
          item.durationSeconds - MIN_RESUMABLE_SECONDS),
  );

  function toQueueItem(item: PageItem): QueueItem {
    return {
      id: item.id,
      title: item.title,
      thumbnailFile: item.thumbnailFile,
      durationSeconds: item.durationSeconds,
    };
  }

  function play(items: PageItem[]) {
    if (!items[0]) return;
    clear();
    items.slice(1).forEach((item) => add(toQueueItem(item)));
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: items[0].id }));
  }

  function resume() {
    if (!resumeItem) return;
    clear();
    window.dispatchEvent(
      new CustomEvent(PLAY_EVENT, {
        detail: { id: resumeItem.id, resume: true },
      }),
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={label}>
      <button
        type="button"
        onClick={() => play(videos)}
        disabled={isLoading || videos.length === 0}
        className="flex items-center gap-2 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
      >
        <Play className="size-4 fill-current" /> Play All
      </button>
      <button
        type="button"
        onClick={() => play([...videos].sort(() => Math.random() - 0.5))}
        disabled={isLoading || videos.length === 0}
        className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-40"
      >
        <Dices className="size-4" /> Shuffle
      </button>
      {resumeItem && (
        <button
          type="button"
          onClick={resume}
          className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-accent"
        >
          <RotateCcw className="size-4" /> Resume
        </button>
      )}
    </div>
  );
}
