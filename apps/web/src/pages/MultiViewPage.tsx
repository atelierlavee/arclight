import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Grid2x2,
  Pause,
  Play,
  Plus,
  Replace,
  Search,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { fetchItem, thumbnailUrl } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";
import { cn, formatDuration } from "@/lib/utils";
import { MULTIVIEW_MAX, parseMultiviewIds } from "@/lib/multiview";

const routeApi = getRouteApi("/multiview");

type SearchHit = {
  id: number;
  title: string;
  itemType: string;
  thumbnailFile?: string | null;
  durationSeconds: number | null;
};

/**
 * Several videos at once, in a grid.
 *
 * Every picture plays; only one is heard. Clicking a picture's speaker (or
 * pressing its number) moves the sound there, which is the whole interaction
 * the page is built around. Each cell keeps the browser's own controls for
 * seeking, since four custom scrubbers would be a lot of UI for one page.
 *
 * Nothing here records watch progress or history: four videos running side
 * by side is not watching any one of them, and counting it would fill
 * Continue Watching and the stats with things you only glanced at.
 *
 * The ids live in the URL, so a set can be bookmarked or reopened.
 */
export function MultiViewPage() {
  const { ids: idsParam } = routeApi.useSearch();
  const navigate = useNavigate();
  const ids = parseMultiviewIds(idsParam);
  const [audible, setAudible] = useState<number | null>(ids[0] ?? null);
  const [paused, setPaused] = useState(false);
  const [replacing, setReplacing] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);

  // The sound follows a removed video's replacement or falls back to the first.
  const audibleId = audible !== null && ids.includes(audible) ? audible : (ids[0] ?? null);

  function setIds(next: number[]) {
    void navigate({
      to: "/multiview",
      search: { ids: next.length ? next.join(",") : undefined },
      replace: true,
    });
  }

  function pick(id: number) {
    if (replacing !== null) {
      setIds(ids.map((existing) => (existing === replacing ? id : existing)));
      if (audibleId === replacing) setAudible(id);
      setReplacing(null);
    } else if (!ids.includes(id) && ids.length < MULTIVIEW_MAX) {
      setIds([...ids, id]);
    }
    setPicking(false);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (/^[1-4]$/.test(event.key)) {
        const id = ids[Number(event.key) - 1];
        if (id !== undefined) setAudible(id);
      } else if (event.key === " ") {
        event.preventDefault();
        setPaused((value) => !value);
      } else if (event.key === "Escape" && !picking) {
        window.history.back();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ids, picking]);

  const layout =
    ids.length <= 1
      ? "grid-cols-1 grid-rows-1"
      : ids.length === 2
        ? "grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1"
        : "grid-cols-2 grid-rows-2";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          aria-label="Back"
          title="Back (Esc)"
          className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Grid2x2 className="size-4" />
          Multi-view
        </span>
        <span className="text-xs text-white/50">
          {ids.length} of {MULTIVIEW_MAX} · 1–{Math.max(1, ids.length)} picks who you hear · Space pauses all
        </span>
        <div className="ml-auto flex items-center gap-1">
          {ids.length > 0 && (
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition-colors hover:bg-white/10"
            >
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {paused ? "Play all" : "Pause all"}
            </button>
          )}
          {ids.length < MULTIVIEW_MAX && (
            <button
              type="button"
              onClick={() => {
                setReplacing(null);
                setPicking(true);
              }}
              className="flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-black transition-colors hover:bg-white/90"
            >
              <Plus className="size-3.5" />
              Add a video
            </button>
          )}
        </div>
      </header>

      {ids.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Grid2x2 className="size-10 text-white/30" />
          <p className="max-w-sm text-sm text-white/60">
            Watch up to four videos side by side. Add them here, or select a
            few tiles in the library and choose Multi-view.
          </p>
          <Link to="/browse" className="text-sm text-white underline-offset-2 hover:underline">
            Go to the library
          </Link>
        </div>
      ) : (
        <div className={cn("grid min-h-0 flex-1 gap-1 p-1", layout)}>
          {ids.map((id, index) => (
            <MultiViewCell
              key={id}
              id={id}
              position={index + 1}
              audible={audibleId === id}
              paused={paused}
              onListen={() => setAudible(id)}
              onReplace={() => {
                setReplacing(id);
                setPicking(true);
              }}
              onRemove={() => setIds(ids.filter((existing) => existing !== id))}
            />
          ))}
        </div>
      )}

      {picking && (
        <VideoPicker
          exclude={ids}
          title={replacing !== null ? "Swap this video for…" : "Add a video"}
          onPick={pick}
          onClose={() => {
            setPicking(false);
            setReplacing(null);
          }}
        />
      )}
    </div>
  );
}

function MultiViewCell({
  id,
  position,
  audible,
  paused,
  onListen,
  onReplace,
  onRemove,
}: {
  id: number;
  position: number;
  audible: boolean;
  paused: boolean;
  onListen: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { data: item, isError } = useQuery({
    queryKey: qk.mediaItem.detail(id),
    queryFn: () => fetchItem(id),
  });

  // `muted` as a React prop only sets the initial attribute, so it is applied
  // to the element directly every time the sound moves.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = !audible;
  }, [audible, item]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else void video.play().catch(() => {});
  }, [paused, item]);

  const playable = item?.itemType === "video";

  return (
    <div
      className={cn(
        "group relative min-h-0 overflow-hidden rounded bg-neutral-950 ring-2 transition-shadow",
        audible ? "ring-white/70" : "ring-transparent",
      )}
    >
      {isError && (
        <p className="flex h-full items-center justify-center text-sm text-white/50">
          This video isn’t available.
        </p>
      )}
      {item && !playable && (
        <p className="flex h-full items-center justify-center text-sm text-white/50">
          Only videos play here.
        </p>
      )}
      {playable && (
        <video
          ref={videoRef}
          key={item.id}
          src={`/api/stream/${item.id}`}
          poster={thumbnailUrl(item)}
          autoPlay={!paused}
          muted={!audible}
          playsInline
          controls
          onLoadedMetadata={(event) => {
            // Where you left off, so a set you come back to does not restart.
            const video = event.currentTarget;
            if (item.lastPositionSeconds > 15) video.currentTime = item.lastPositionSeconds;
            video.muted = !audible;
          }}
          className="sensitive h-full w-full object-contain"
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 bg-gradient-to-b from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <span className="rounded bg-white/15 px-1.5 text-xs font-semibold tabular-nums">{position}</span>
        <span className="sensitive min-w-0 flex-1 truncate text-xs font-medium">
          {item?.title ?? "Loading…"}
          {item?.durationSeconds ? (
            <span className="text-white/50"> · {formatDuration(item.durationSeconds)}</span>
          ) : null}
        </span>
        <div className="pointer-events-auto flex gap-1">
          <button
            type="button"
            onClick={onReplace}
            aria-label="Swap for another video"
            title="Swap for another video"
            className="flex size-7 items-center justify-center rounded-full bg-black/60 transition-colors hover:bg-black/80"
          >
            <Replace className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove from multi-view"
            title="Remove"
            className="flex size-7 items-center justify-center rounded-full bg-black/60 transition-colors hover:bg-black/80"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Always visible: which picture you are hearing is the one thing on
          this page you must be able to tell at a glance. */}
      <button
        type="button"
        onClick={onListen}
        aria-pressed={audible}
        aria-label={audible ? `Hearing video ${position}` : `Listen to video ${position}`}
        title={audible ? "You are hearing this one" : `Listen to this one (${position})`}
        className={cn(
          "absolute bottom-14 right-2 flex size-9 items-center justify-center rounded-full backdrop-blur-sm transition-colors",
          audible ? "bg-white text-black" : "bg-black/60 text-white hover:bg-black/80",
        )}
      >
        {audible ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      </button>
    </div>
  );
}

function VideoPicker({
  exclude,
  title,
  onPick,
  onClose,
}: {
  exclude: number[];
  title: string;
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: qk.multiviewSearch(debounced),
    queryFn: async () => {
      const params = new URLSearchParams({ type: "video" });
      // With nothing typed, the newest arrivals are a reasonable place to start.
      if (debounced) params.set("q", debounced);
      const res = await fetch(`/api/media-items?${params}`);
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      return (await res.json()) as { items: SearchHit[] };
    },
  });
  const hits = (data?.items ?? []).filter((hit) => !exclude.includes(hit.id)).slice(0, 12);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[10vh] backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-soft-pop w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${title} — search titles, performers, studios…`}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-1">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onPick(hit.id)}
                className="flex w-full items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-accent"
              >
                <img
                  src={thumbnailUrl(hit)}
                  alt=""
                  className="sensitive aspect-video w-24 shrink-0 rounded object-cover"
                />
                <span className="sensitive min-w-0 flex-1 truncate text-sm">{hit.title}</span>
                {hit.durationSeconds ? (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatDuration(hit.durationSeconds)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {!isFetching && hits.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
