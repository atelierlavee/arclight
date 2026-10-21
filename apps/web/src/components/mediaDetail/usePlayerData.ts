import { useQuery } from "@tanstack/react-query";
import {
  formatTimestamp,
  useBookmarkMutations,
  useBookmarks,
  useScrubSprite,
} from "@/lib/bookmarkApi";
import { fetchCategories } from "@/lib/categoryApi";
import { useAccentColor } from "@/lib/dominantColor";
import { thumbnailUrl, type MediaItemDetail } from "@/lib/mediaItemApi";
import { useToast } from "@/lib/toast";

/**
 * What the modal shows alongside the item itself: its bookmarks, the seek
 * bar's preview sprite and heatmap, the category list and the accent colour.
 */
export function usePlayerData({
  viewingId,
  item,
  mode,
  mini,
  videoRef,
}: {
  viewingId: number;
  item: MediaItemDetail | undefined;
  mode: "preview" | "playing";
  mini: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const { toast } = useToast();
  const isVideo = item?.itemType === "video";
  const { data: bookmarks = [] } = useBookmarks(viewingId, isVideo);
  const bookmarkMutations = useBookmarkMutations(viewingId);
  // Asked for as soon as real playback starts, not on hover: the first build
  // takes a few seconds, and by the time you reach for the bar it is there.
  const { data: scrubSprite } = useScrubSprite(
    viewingId,
    isVideo && mode === "playing" && !mini,
  );
  const { data: heatmapData } = useQuery({
    queryKey: ["heatmap", viewingId],
    queryFn: async () => {
      const res = await fetch(`/api/media-items/${viewingId}/heatmap`);
      if (!res.ok) return { buckets: [] as number[] };
      return res.json() as Promise<{ buckets: number[] }>;
    },
    enabled: isVideo && mode === "playing",
    staleTime: 60_000,
  });

  const { data: categoryData } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  const categories = categoryData?.categories ?? [];
  const accent = useAccentColor(item ? thumbnailUrl(item) : null);

  /** Marks the current moment. Named later, from the list under the video. */
  function addBookmark() {
    const video = videoRef.current;
    if (!video || mode !== "playing") return;
    const at = video.currentTime;
    bookmarkMutations.add.mutate(
      { positionSeconds: at },
      {
        onSuccess: () =>
          toast({ title: "Bookmarked", description: formatTimestamp(at), variant: "success" }),
      },
    );
  }

  return {
    bookmarks,
    scrubSprite,
    heatmapBuckets: heatmapData?.buckets,
    categories,
    accent,
    addBookmark,
  };
}
