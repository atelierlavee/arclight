import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Shapes } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { playItem } from "@/lib/appEvents";
import { formatTimestamp } from "@/lib/bookmarkApi";
import { markerColor, markerKey, usePositionNames, type PositionMarker } from "@/lib/markerApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

const routeApi = getRouteApi("/positions");

/**
 * Every named position in the library, by name: pick "Missionary" and get
 * each moment it starts, in every video that has it, one click from playing
 * there. The names come from the seek bar's markers, spellings merged.
 */
export function PositionsPage() {
  const { position } = routeApi.useSearch();
  const navigate = useNavigate();
  const names = usePositionNames();
  const selected = position ? markerKey(position) : (names.data?.[0]?.key ?? null);
  const selectedName = names.data?.find((n) => n.key === selected);

  const list = useInfiniteQuery({
    queryKey: qk.positions.list(selected ?? ""),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ name: selected ?? "", offset: String(pageParam) });
      const res = await fetch(`/api/markers?${params}`);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return res.json() as Promise<{ markers: PositionMarker[]; nextOffset: number | null }>;
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: selected !== null,
  });
  const markers = list.data?.pages.flatMap((page) => page.markers) ?? [];

  return (
    <AppShell title="Positions" subtitle="Every named moment in your library, ready to play from.">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
        {names.isLoading && <div className="skeleton h-10 rounded-lg" />}

        {names.data && names.data.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Shapes className="size-8 text-muted-foreground/50" />
            No positions yet. Fetch them from ThePornDB in Site settings → Library, or on a video's
            details, or add them by hand while watching.
          </div>
        )}

        {names.data && names.data.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {names.data.map((name) => (
              <button
                key={name.key}
                type="button"
                onClick={() =>
                  void navigate({ to: "/positions", search: { position: name.key }, replace: true })
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                  name.key === selected
                    ? "border-foreground/40 bg-accent font-medium text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: markerColor(name.name) }} />
                {name.name}
                <span className="tabular-nums opacity-60">{name.markers}</span>
              </button>
            ))}
          </div>
        )}

        {selectedName && (
          <p className="text-sm text-muted-foreground">
            {selectedName.markers} moment{selectedName.markers === 1 ? "" : "s"} in {selectedName.videos} video
            {selectedName.videos === 1 ? "" : "s"}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {markers.map((marker) => (
            <PositionTile key={marker.id} marker={marker} />
          ))}
          {list.isLoading &&
            Array.from({ length: 10 }, (_, i) => <div key={i} className="skeleton aspect-video rounded-lg" />)}
        </div>

        {list.hasNextPage && (
          <div className="flex justify-center">
            <button
              type="button"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
              className="rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
            >
              {list.isFetchingNextPage ? "Loading…" : "More"}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/**
 * One moment: the video's poster, and on hover the video itself from that
 * second, muted. Played straight from the stream with a media fragment, so
 * there is nothing to generate for it.
 */
function PositionTile({ marker }: { marker: PositionMarker }) {
  const [hovering, setHovering] = useState(false);
  const end = marker.endSeconds ?? marker.startSeconds + 20;

  return (
    <button
      type="button"
      onClick={() => playItem(marker.item.id, { startAt: marker.startSeconds })}
      onPointerEnter={(event) => event.pointerType === "mouse" && setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      className="group space-y-1.5 text-left"
      title={`Play ${marker.item.title} from ${formatTimestamp(marker.startSeconds)}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-lg bg-muted ring-1 ring-border">
        <img
          src={thumbnailUrl(marker.item)}
          alt=""
          loading="lazy"
          className="sensitive size-full object-cover"
        />
        {hovering && (
          <video
            src={`/api/stream/${marker.item.id}#t=${marker.startSeconds},${end}`}
            autoPlay
            muted
            playsInline
            className="sensitive absolute inset-0 size-full object-cover"
          />
        )}
        <span
          className="absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
        >
          <span style={{ color: markerColor(marker.title) }}>{marker.title}</span> ·{" "}
          {formatTimestamp(marker.startSeconds)}
        </span>
      </div>
      <div className="min-w-0">
        <p className="sensitive truncate text-sm font-medium group-hover:underline">{marker.item.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[marker.studio, marker.item.releaseDate].filter(Boolean).join(" · ")}
        </p>
      </div>
    </button>
  );
}
