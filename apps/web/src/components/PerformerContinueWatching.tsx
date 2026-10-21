import { useQuery } from "@tanstack/react-query";
import { MediaRow } from "./MediaRow";
import type { MediaCardItem } from "./MediaCard";
import type { PerformerDetail } from "@/lib/performerApi";
import { qk } from "@/lib/queryKeys";

/**
 * This performer's part-watched videos.
 *
 * Scoped to one performer, which /api/continue-watching cannot do — that one
 * is global. Skipped entirely when the profile already reports nothing in
 * progress, so a performer you've never watched costs no request at all.
 */
export function PerformerContinueWatching({
  performer,
  onSelect,
}: {
  performer: PerformerDetail;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const enabled = performer.watch.inProgress > 0;

  const { data, isLoading } = useQuery({
    queryKey: qk.performerInProgress.forPerformer(performer.id),
    queryFn: async (): Promise<{ items: MediaCardItem[] }> => {
      const params = new URLSearchParams({
        performer: performer.name,
        progress: "in-progress",
      });
      const res = await fetch(`/api/media-items?${params}`);
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      return res.json();
    },
    enabled,
  });

  if (!enabled) return null;

  return (
    <MediaRow
      title="Continue watching"
      items={data?.items ?? []}
      loading={isLoading}
      onSelectItem={(id) => onSelect(id, false)}
      onPlayItem={(id) => onSelect(id, true)}
      onOpenFolder={() => {}}
    />
  );
}
