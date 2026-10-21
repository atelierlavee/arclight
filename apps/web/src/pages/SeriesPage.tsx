import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Play, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { PlaySurface } from "@/components/PlaySurface";
import { fetchSeriesDetail } from "@/lib/seriesApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";

const routeApi = getRouteApi("/series/$seriesId");

export function SeriesPage() {
  const { seriesId } = routeApi.useParams();
  const id = Number(seriesId);
  const [season, setSeason] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isError, isLoading } = useQuery({
    queryKey: qk.series.detail(id),
    queryFn: () => fetchSeriesDetail(id),
  });

  if (isError) {
    return <AppShell title="Series not found"><p className="px-4 text-sm text-muted-foreground md:px-6">That series could not be found.</p></AppShell>;
  }
  if (isLoading || !data) return <AppShell><div className="skeleton mx-6 my-8 h-64 rounded-lg" /></AppShell>;

  const activeSeason = season ?? data.seasons[0]?.number ?? 1;
  const episodes = data.seasons.find((entry) => entry.number === activeSeason)?.episodes ?? [];
  const allEpisodes = data.seasons.flatMap((entry) => entry.episodes);
  const firstUnwatched = allEpisodes.find((episode) => !episode.completedAt);

  return (
    <AppShell>
      <div className="space-y-6 px-4 py-6 md:px-6 md:py-8">
        <Breadcrumbs items={[{ label: "Series", to: "/series" }, { label: data.name }]} />
        <div className="relative overflow-hidden rounded-xl bg-secondary">
          {allEpisodes[0] && <img src={thumbnailUrl(allEpisodes[0])} alt="" className="h-48 w-full object-cover opacity-55" />}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 space-y-3 p-5">
          <h1 className="sensitive text-3xl font-bold tracking-tight text-white drop-shadow sm:text-4xl">{data.name}</h1>
          <p className="text-sm text-muted-foreground">
            {data.seasons.length} {data.seasons.length === 1 ? "season" : "seasons"} · {allEpisodes.length} {allEpisodes.length === 1 ? "episode" : "episodes"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <PlaySurface
              items={allEpisodes.map((episode) => ({
                ...episode,
                itemType: "video" as const,
                lastPositionSeconds: episode.lastPositionSeconds ?? undefined,
              }))}
              label="Series playback"
            />
            {firstUnwatched && (
              <button
                type="button"
                onClick={() => setOpenId(firstUnwatched.id)}
                className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                <RotateCcw className="size-4" /> Resume
              </button>
            )}
          </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-border pb-2">
          {data.seasons.map((entry) => (
            <button
              key={entry.number}
              type="button"
              onClick={() => setSeason(entry.number)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${activeSeason === entry.number ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              Season {entry.number}
            </button>
          ))}
        </div>

        <section className="space-y-3">
          {episodes.map((episode) => {
            const progress = episode.durationSeconds && episode.lastPositionSeconds
              ? Math.round((episode.lastPositionSeconds / episode.durationSeconds) * 100)
              : 0;
            return (
              <button
                key={episode.id}
                type="button"
                onClick={() => setOpenId(episode.id)}
                className="group flex w-full items-center gap-4 rounded-lg border border-border bg-card/50 p-3 text-left transition-colors hover:bg-accent"
              >
                <img src={thumbnailUrl(episode)} alt="" className="aspect-video w-36 shrink-0 rounded object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Episode {String(episode.episodeNumber ?? 0).padStart(2, "0")}</span>
                  <span className="mt-1 block truncate font-medium">{episode.episodeTitle || episode.title}</span>
                  {episode.completedAt ? <span className="mt-1 block text-xs text-emerald-500">Watched</span> : progress > 0 ? <span className="mt-1 block text-xs text-muted-foreground">{progress}% watched</span> : <span className="mt-1 block text-xs text-muted-foreground">Unwatched</span>}
                </span>
                <Play className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            );
          })}
        </section>
      </div>
      {openId !== null && <MediaDetailModal itemId={openId} autoPlay onClose={() => setOpenId(null)} />}
    </AppShell>
  );
}
