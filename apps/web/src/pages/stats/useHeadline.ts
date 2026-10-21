import { useQuery } from "@tanstack/react-query";
import { useAppearance } from "@/lib/appearance";
import type { hallOfFame, Insights, InsightItem } from "@/lib/insights";
import { fetchItem } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";

export type Headline = { item: InsightItem; seconds: number; names: string; isPinned: boolean } | null;

/** Your #1 video: the one you pinned, otherwise the one you've watched most. */
export function useHeadline(data: Insights, auto: ReturnType<typeof hallOfFame>["mainEvent"]): Headline {
  const { hallOfFamePin } = useAppearance();
  const { data: pinned } = useQuery({
    queryKey: qk.mediaItem.detail(hallOfFamePin),
    queryFn: () => fetchItem(hallOfFamePin),
    enabled: hallOfFamePin > 0,
    retry: false,
  });
  if (hallOfFamePin > 0 && pinned) {
    return {
      item: {
        id: pinned.id,
        title: pinned.title,
        thumbnailFile: pinned.thumbnailFile,
        durationSeconds: pinned.durationSeconds,
        rating: pinned.rating,
        studio: pinned.studio,
        playCount: pinned.playCount,
        completedAt: pinned.watchedAt,
        performerIds: [],
      },
      names: pinned.performers.map((p) => p.name).join(", "),
      seconds: data.log.filter((e) => e.mediaItemId === pinned.id).reduce((sum, e) => sum + e.seconds, 0),
      isPinned: true,
    };
  }
  if (!auto) return null;
  return {
    ...auto,
    names: auto.item.performerIds
      .map((id) => data.performers.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(", "),
    isPinned: false,
  };
}
