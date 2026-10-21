import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Film } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AlphabetIndex } from "@/components/AlphabetIndex";
import { fetchSeries } from "@/lib/seriesApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { useState } from "react";
import { qk } from "@/lib/queryKeys";

export function SeriesPageIndex() {
  const [letter, setLetter] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: qk.series.all, queryFn: fetchSeries });
  const all = data?.series ?? [];
  const visible = letter
    ? all.filter((entry) => {
        const initial = entry.name.trim().charAt(0).toUpperCase();
        return letter === "#" ? !/^[A-Z]$/.test(initial) : initial === letter;
      })
    : all;

  return (
    <AppShell title="Series" subtitle={all.length ? `${all.length} series` : undefined}>
      <div className="space-y-6 px-4 py-6 md:px-6 md:py-8">
        <AlphabetIndex value={letter} onChange={setLetter} available={all.map((entry) => entry.name)} />
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton aspect-video rounded-lg" />)}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No series yet. Use S01E01 naming to group episodes during scanning.</p>
        ) : (
          <div className="stagger grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((entry) => (
              <Link key={entry.id} to="/series/$seriesId" params={{ seriesId: String(entry.id) }} className="group rounded-lg border border-border bg-card/50 p-4 transition-colors hover:bg-accent">
                <div className="aspect-video overflow-hidden rounded-md bg-secondary">
                  {entry.representativeItemId != null ? (
                    <img src={thumbnailUrl({ id: entry.representativeItemId })} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center"><Film className="size-5 text-muted-foreground" /></div>
                  )}
                </div>
                <h2 className="mt-4 truncate font-medium group-hover:underline">{entry.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{entry.episodeCount} episodes · {entry.unwatched} unwatched</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
