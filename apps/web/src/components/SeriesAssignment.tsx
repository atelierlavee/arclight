import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSeries, fetchSeries, type SeriesSummary } from "@/lib/seriesApi";
import { updateItem, type MediaItemDetail } from "@/lib/mediaItemApi";
import { useToast } from "@/lib/toast";
import { qk } from "@/lib/queryKeys";

export function SeriesAssignment({ item }: { item: MediaItemDetail }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const { data } = useQuery({ queryKey: qk.series.all, queryFn: fetchSeries });

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateItem>[1]) => updateItem(item.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.mediaItem.detail(item.id) });
      queryClient.invalidateQueries({ queryKey: qk.series.all });
      queryClient.invalidateQueries({ queryKey: qk.series.detail(item.seriesId) });
    },
    onError: (error) => {
      toast({
        title: "Could not save series details",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      });
    },
  });
  const create = useMutation({
    mutationFn: (seriesName: string) => createSeries(seriesName, item.id),
    onSuccess: (created) => {
      setName("");
      setCreating(false);
      save.mutate({ seriesId: created.id, seasonNumber: item.seasonNumber ?? 1, episodeNumber: item.episodeNumber ?? 1 });
      toast({ title: `Created series "${created.name}"`, variant: "success" });
    },
    onError: (error) => {
      toast({
        title: "Could not create series",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      });
    },
  });

  const assign = (seriesId: number | null) => {
    save.mutate({ seriesId, seasonNumber: seriesId === null ? null : item.seasonNumber ?? 1, episodeNumber: seriesId === null ? null : item.episodeNumber ?? 1 });
  };

  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Series</span>
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className="text-xs text-muted-foreground hover:text-foreground">
            New series
          </button>
        )}
      </div>
      {creating ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) create.mutate(name.trim());
          }}
          className="flex gap-2"
        >
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Series name" className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm" />
          <button type="submit" disabled={!name.trim() || create.isPending} className="rounded bg-foreground px-2 py-1 text-xs text-background disabled:opacity-50">Create</button>
          <button type="button" onClick={() => setCreating(false)} className="text-xs text-muted-foreground">Cancel</button>
        </form>
      ) : (
        <select value={item.seriesId ?? ""} onChange={(event) => assign(event.target.value ? Number(event.target.value) : null)} disabled={save.isPending} className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm">
          <option value="">Not assigned</option>
          {(data?.series ?? []).map((series: SeriesSummary) => <option key={series.id} value={series.id}>{series.name}</option>)}
        </select>
      )}
      {item.seriesId !== null && !creating && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">Season<input type="number" min="1" value={item.seasonNumber ?? 1} onChange={(event) => save.mutate({ seasonNumber: Number(event.target.value) || 1 })} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground" /></label>
          <label className="text-xs text-muted-foreground">Episode<input type="number" min="1" value={item.episodeNumber ?? 1} onChange={(event) => save.mutate({ episodeNumber: Number(event.target.value) || 1 })} className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground" /></label>
        </div>
      )}
      {item.seriesId !== null && !creating && <input defaultValue={item.episodeTitle ?? ""} onBlur={(event) => { if (event.target.value !== (item.episodeTitle ?? "")) save.mutate({ episodeTitle: event.target.value }); }} placeholder="Episode title (optional)" className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />}
    </div>
  );
}
