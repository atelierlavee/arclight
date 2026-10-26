import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AlbumRow } from "@/components/AlbumRow";
import { MediaGrid } from "@/components/MediaGrid";
import { PerformerCoPerformers } from "@/components/PerformerCoPerformers";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { fetchStudio, type StudioDetail } from "@/lib/studioApi";
import { PlaySurface } from "@/components/PlaySurface";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StudioNetwork } from "@/components/StudioNetwork";
import { qk } from "@/lib/queryKeys";

const routeApi = getRouteApi("/studio/$studioId");

function formatDuration(seconds: number): string | null {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * The shape of a studio's catalogue in one line, mirroring PerformerStats.
 *
 * Every figure comes from the same set the grid below renders, so the numbers
 * and the page can't disagree. Parts that would be noise are dropped rather
 * than printed as zeroes.
 */
function StudioStats({ studio }: { studio: StudioDetail }) {
  const duration = formatDuration(studio.totalDurationSeconds);
  const years = studio.years
    .map((y) => y.year)
    .filter((y): y is number => y !== null);
  const [from, to] = [Math.min(...years), Math.max(...years)];

  const parts: string[] = [
    `${studio.videoCount} ${studio.videoCount === 1 ? "video" : "videos"}`,
  ];
  if (duration) parts.push(duration);
  if (studio.performers.length > 0) {
    parts.push(
      `${studio.performers.length} ${studio.performers.length === 1 ? "performer" : "performers"}`,
    );
  }
  if (studio.albumCount > 0) {
    parts.push(
      `${studio.albumCount} ${studio.albumCount === 1 ? "album" : "albums"}`,
    );
  }
  if (years.length > 0) parts.push(from === to ? `${from}` : `${from}–${to}`);
  if (studio.watch.unwatched > 0)
    parts.push(`${studio.watch.unwatched} unwatched`);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-2">
          {index > 0 && <span className="text-muted-foreground/40">·</span>}
          <span
            className={
              index === 0 ? "font-medium text-foreground/90" : undefined
            }
          >
            {part}
          </span>
        </span>
      ))}
    </div>
  );
}

export function StudioPage() {
  const { studioId } = routeApi.useParams();
  const id = Number(studioId);
  const [folder, setFolder] = useState<{ id: number; title: string } | null>(
    null,
  );

  const { data: studio, isError } = useQuery({
    queryKey: qk.studio.detail(id),
    queryFn: () => fetchStudio(id),
  });

  if (isError) {
    return (
      <AppShell title="Studio not found">
        <p className="px-4 text-sm text-muted-foreground md:px-6">
          That studio doesn’t exist — it may have been removed when its last
          video went away.
        </p>
      </AppShell>
    );
  }

  // A frame from one of their videos, since a studio has no artwork of its
  // own — there's no external metadata source here to fetch a logo from, and
  // nothing to upload one against yet.
  const backdrop =
    studio?.bannerItemId != null
      ? thumbnailUrl({ id: studio.bannerItemId })
      : null;

  return (
    <AppShell>
      <section className="relative h-56 w-full overflow-hidden sm:h-72">
        {backdrop ? (
          <img
            src={backdrop}
            alt=""
            // Blurred and dimmed: it's one video's frame standing in for a
            // whole catalogue, so it should read as texture rather than as a
            // claim about what you're looking at.
            className="h-full w-full scale-110 object-cover blur-sm brightness-[0.45]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-secondary to-background" />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 px-4 pb-4 md:gap-4 md:px-6 md:pb-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-black/50 ring-1 ring-white/15 backdrop-blur-sm sm:size-16 md:size-20">
            <Building2 className="size-6 text-white/80 sm:size-7 md:size-9" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 pb-1">
            <h1 className="sensitive truncate text-xl font-bold tracking-tight text-white drop-shadow sm:text-3xl md:text-4xl">
              {studio?.name ?? " "}
            </h1>
            {studio && <StudioStats studio={studio} />}
            {studio && (
              <PlaySurface
                source={{
                  type: "library",
                  studio: studio.name,
                  tag: null,
                  performer: null,
                  kind: null,
                  q: null,
                  parentId: null,
                }}
                label="Studio playback"
              />
            )}
          </div>
        </div>
      </section>

      {studio && (
        <div className="px-4 pt-5 md:px-6">
          <Breadcrumbs
            items={[
              { label: "Studios", to: "/studios" },
              { label: studio.name },
            ]}
          />
          <div className="mt-4">
            <StudioNetwork studio={studio} />
          </div>
        </div>
      )}

      {studio && (
        <div className="space-y-8 px-4 py-6 md:px-6 md:py-8">
          <PerformerCoPerformers
            performers={studio.performers}
            title="Featuring"
          />

          <AlbumRow studio={studio.name} />

          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Videos
            </h2>
            {/* The grid brings its own Sort and Year controls, and pages as
                you scroll — so a studio with hundreds of scenes costs one
                page of requests rather than all of them. */}
            <MediaGrid
              source={{
                type: "library",
                studio: studio.name,
                tag: null,
                performer: null,
                kind: null,
                q: null,
                parentId: folder?.id ?? null,
              }}
              onOpenFolder={(folderId, title) =>
                setFolder({ id: folderId, title })
              }
            />
          </section>
        </div>
      )}
    </AppShell>
  );
}
