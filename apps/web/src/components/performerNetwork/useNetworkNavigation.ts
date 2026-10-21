import { useNavigate } from "@tanstack/react-router";
import type { NetworkNode } from "@/lib/performerApi";

/** Leaving the graph for a performer's or studio's page, or their videos. */
export function useNetworkNavigation(nodesById: Map<number, NetworkNode>) {
  const navigate = useNavigate();

  const openProfile = (id: number) => {
    const node = nodesById.get(id);
    if (node?.kind === "studio" && node.studioId != null) {
      void navigate({ to: "/studio/$studioId", params: { studioId: String(node.studioId) } });
    } else {
      void navigate({ to: "/performer/$performerId", params: { performerId: String(id) } });
    }
  };
  /** A performer's videos for one studio — what a performer–studio line means. */
  const openStudioVideos = (edge: { source: number; target: number }) => {
    const [performerId, studioNode] = edge.source < 0 ? [edge.target, edge.source] : [edge.source, edge.target];
    const performer = nodesById.get(performerId);
    const studio = nodesById.get(studioNode);
    if (performer && studio) {
      void navigate({ to: "/browse", search: { performer: performer.name, studio: studio.name } });
    }
  };

  return { openProfile, openStudioVideos };
}
