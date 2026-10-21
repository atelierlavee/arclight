import { useState } from "react";
import { useQueue } from "@/lib/queue";
import { fetchLatestVideos, fetchVideosWhere, type NetworkNode, type SharedVideo } from "@/lib/performerApi";

/** Playing from the graph: one video, a set of them, or someone's latest. */
export function useNetworkPlayback() {
  const [playing, setPlaying] = useState<number | null>(null);
  const { add: addToQueue } = useQueue();

  // The player opens over the page, which a full-screen graph would hide, so
  // playing something leaves full screen first.
  const play = (itemId: number) => {
    if (document.fullscreenElement) void document.exitFullscreen();
    setPlaying(itemId);
  };

  /** Plays the first video now and queues the rest behind whatever's queued. */
  const playAll = (videos: (SharedVideo & { durationSeconds?: number | null })[]) => {
    if (videos.length === 0) return;
    for (const video of videos.slice(1)) {
      addToQueue({
        id: video.id,
        title: video.title,
        thumbnailFile: video.thumbnailFile,
        durationSeconds: video.durationSeconds ?? null,
      });
    }
    play(videos[0].id);
  };
  const playLatest = async (node: NetworkNode) => {
    const videos =
      node.kind === "studio"
        ? await fetchVideosWhere({ studio: node.name })
        : await fetchLatestVideos(node.name);
    if (videos[0]) play(videos[0].id);
  };

  return { playing, stopPlaying: () => setPlaying(null), play, playAll, playLatest };
}
