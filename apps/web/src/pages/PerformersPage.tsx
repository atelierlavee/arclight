// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Archive, ArrowUpDown, Check, ChevronRight, LayoutGrid, List, Search, Share2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  PerformerCard,
  type PerformerSummary,
} from "@/components/PerformerCard";
import { performerPortraitUrl, portraitStyle } from "@/lib/performerApi";
import { PerformerNetwork } from "@/components/PerformerNetwork";
import { pinsChangedEvent, readPins } from "@/lib/pinned";
import { tileWidthPx, useAppearance, PageScope } from "@/lib/appearance";
import { cardLayout } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";

const routeApi = getRouteApi("/performers");

type View = "grid" | "list" | "network";

/** Grid of cards, names as a list, or the graph of who appears with whom. */
function ViewSwitch({ view }: { view: View }) {
  const navigate = useNavigate();
  const options = [
    { key: "grid", label: "Grid", icon: LayoutGrid },
    { key: "list", label: "List", icon: List },
    { key: "network", label: "Network", icon: Share2 },
  ] as const;
  return (
    <div className="flex rounded-md bg-secondary p-0.5" role="group" aria-label="View">
      {options.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          title={label}
          aria-pressed={view === key}
          onClick={() =>
            void navigate({
              to: "/performers",
              search: key === "grid" ? {} : { view: key },
            })
          }
          className={cn(
            "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
            view === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {/* Icons alone on a phone, where the header also has to fit the
              page title. */}
          <span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

/** How the page can be ordered. */
const SORTS = [
  { key: "name", label: "A–Z" },
  { key: "videos", label: "Most videos" },
  { key: "added", label: "Recently added" },
  { key: "watched", label: "Most watched" },
  { key: "release", label: "Newest release" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];
const SORT_STORAGE = "performers-sort";

function readSort(): SortKey {
  try {
    const stored = localStorage.getItem(SORT_STORAGE);
    return SORTS.some((sort) => sort.key === stored) ? (stored as SortKey) : "name";
  } catch {
    return "name";
  }
}

function byName(a: PerformerSummary, b: PerformerSummary) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** The comparator for a sort; ties fall back to the name. */
function comparator(sort: SortKey) {
  const time = (value: string | null | undefined) => (value ? new Date(value).getTime() : 0);
  return (a: PerformerSummary, b: PerformerSummary) => {
    const diff =
      sort === "videos"
        ? b.videoCount - a.videoCount
        : sort === "added"
          ? time(b.latestAddedAt ?? b.createdAt) - time(a.latestAddedAt ?? a.createdAt)
          : sort === "watched"
            ? (b.watchSeconds ?? 0) - (a.watchSeconds ?? 0)
            : sort === "release"
              ? time(b.latestReleaseDate) - time(a.latestReleaseDate)
              : 0;
    return diff || byName(a, b);
  };
}

/** The sort, as an icon in the header that opens its choices. */
function SortMenu({ value, onChange }: { value: SortKey; onChange: (sort: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const current = SORTS.find((sort) => sort.key === value)!;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort: ${current.label}`}
        title={`Sort: ${current.label}`}
        className={cn(
          "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent",
          value === "name" ? "text-muted-foreground" : "text-primary",
        )}
      >
        <ArrowUpDown className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-44 rounded-md border border-border bg-popover p-1 shadow-xl">
          {SORTS.map((sort) => (
            <button
              key={sort.key}
              type="button"
              role="menuitemradio"
              aria-checked={sort.key === value}
              onClick={() => {
                onChange(sort.key);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent"
            >
              {sort.label}
              {sort.key === value && <Check className="size-3.5 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Search as an icon in the header; a click opens the field beside it. */
function SearchToggle({ value, onChange }: { value: string; onChange: (query: string) => void }) {
  const [open, setOpen] = useState(value !== "");
  const close = () => {
    onChange("");
    setOpen(false);
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Find a performer"
        title="Find a performer"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Search className="size-4" />
      </button>
    );
  }
  return (
    <label className="relative flex items-center">
      <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && close()}
        onBlur={() => value === "" && setOpen(false)}
        placeholder="Find a performer…"
        aria-label="Find a performer"
        className="w-40 rounded-full border border-border bg-secondary/80 py-1 pl-8 pr-7 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60 sm:w-56"
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={close}
        aria-label="Close search"
        className="absolute right-2 text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </label>
  );
}

/** Added within this long counts as a new face. */
const NEW_FACE_DAYS = 30;

/** A sideways row of cards: the stage for who you follow, and new faces. */
function CardRow({
  performers,
  onOpen,
  isNew,
}: {
  performers: PerformerSummary[];
  onOpen: (performer: PerformerSummary) => void;
  isNew?: (performer: PerformerSummary) => boolean;
}) {
  return (
    <div className="scrollbar-hide -mx-4 flex gap-5 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
      {performers.map((performer) => (
        <PerformerCard
          key={performer.id}
          performer={performer}
          onClick={() => onOpen(performer)}
          mono
          isNew={isNew?.(performer)}
        />
      ))}
    </div>
  );
}

/**
 * Names as a list in big type, one under another; the hovered one's
 * portrait stands beside the list, held in place as you scroll.
 */
function NameList({
  performers,
  onOpen,
}: {
  performers: PerformerSummary[];
  onOpen: (performer: PerformerSummary) => void;
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const shown = performers.find((p) => p.id === hoveredId) ?? performers[0];
  const portrait = shown ? performerPortraitUrl(shown) : null;
  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_18rem] lg:grid-cols-[minmax(0,1fr)_22rem]">
      <ul>
        {performers.map((performer) => (
          <li key={performer.id}>
            <button
              type="button"
              onClick={() => onOpen(performer)}
              onMouseEnter={() => setHoveredId(performer.id)}
              onFocus={() => setHoveredId(performer.id)}
              className="group flex w-full items-baseline gap-4 py-1 text-left"
            >
              <span
                className={cn(
                  "sensitive truncate text-3xl font-black tracking-tight transition-colors md:text-5xl",
                  performer.id === shown?.id ? "text-white" : "text-white/30 group-hover:text-white/70",
                )}
              >
                {performer.name}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {performer.videoCount}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {shown && (
        <div className="sticky top-[140px] hidden h-fit md:block">
          <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-secondary shadow-[0_0_50px_-12px_rgba(255,45,149,0.5)] ring-2 ring-primary/70">
            {portrait && (
              <img
                key={shown.id}
                src={portrait}
                alt=""
                style={portraitStyle(shown)}
                className="sensitive animate-fade-in size-full object-cover"
              />
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-12">
              <p className="sensitive text-xs font-semibold uppercase tracking-[0.2em] text-white">{shown.name}</p>
              <p className="sensitive mt-1 truncate text-[11px] text-white/70">
                {[shown.topStudio, `${shown.videoCount} ${shown.videoCount === 1 ? "video" : "videos"}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One section of the page.
 *
 * Extracted because the page has three of these — favourites, with-videos,
 * and empty — and they were three copies of the same markup; changing the
 * spacing in two of them and forgetting the third is exactly the kind of
 * thing that survives review.
 */
function PerformerList({
  performers,
  onOpen,
  layout,
}: {
  performers: PerformerSummary[];
  onOpen: (performer: PerformerSummary) => void;
  layout: ReturnType<typeof cardLayout>;
}) {
  return (
    <div
      className="stagger flex flex-wrap justify-center"
      style={{ columnGap: layout.columnGapPx, rowGap: layout.rowGapPx }}
    >
      {performers.map((performer) => (
        <PerformerCard
          key={performer.id}
          performer={performer}
          onClick={() => onOpen(performer)}
          mono
        />
      ))}
    </div>
  );
}

/** A numbered heading, as on the home page: "01 —— FOLLOWING". */
function Kicker({ n, label }: { n: string; label: string }) {
  return (
    <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
      <span className="font-mono tabular-nums text-muted-foreground">{n}</span>
      <span className="h-px w-8 bg-primary/60" />
      {label}
    </h2>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function PerformersPage() {
  const navigate = useNavigate();
  const search = routeApi.useSearch();
  const view: View = search.view ?? "grid";
  const network = view === "network";
  const { tileSizePercent, tileInfo, viewMode, tileShape, density } = useAppearance();
  // The same axes the media grid uses, so a layout choice made once applies
  // here too rather than only to videos. The shape is passed for the gaps and
  // column width to stay in step; the performer cards themselves keep their
  // own 2:3 frame, which is not a preference.
  const layout = cardLayout(
    tileWidthPx(tileSizePercent),
    viewMode,
    density,
    tileInfo,
    tileShape,
  );

  const openPerformer = (performer: PerformerSummary) =>
    void navigate({
      to: "/performer/$performerId",
      params: { performerId: String(performer.id) },
    });
  // Folded away by default: archiving is for getting someone out of the
  // way, so the section shouldn't greet you on every visit.
  const [showArchived, setShowArchived] = useState(false);
  // Taken once, so "new" doesn't shift between renders.
  const [newFaceCutoff] = useState(() => Date.now() - NEW_FACE_DAYS * 86_400_000);
  const [query, setQuery] = useState("");
  const [sort, setSortState] = useState<SortKey>(readSort);
  const setSort = (next: SortKey) => {
    setSortState(next);
    try {
      localStorage.setItem(SORT_STORAGE, next);
    } catch {
      // A private window: the sort just isn't remembered.
    }
  };
  const [, refreshPins] = useState(0);

  useEffect(() => {
    const refresh = () => refreshPins((value) => value + 1);
    window.addEventListener(pinsChangedEvent(), refresh);
    return () => window.removeEventListener(pinsChangedEvent(), refresh);
  }, []);

  // Its own key, not ["performers"]: that one is the active-only list the
  // home row and the editor share, and caching this longer list under it
  // would leak archived performers back into them. Still under the prefix,
  // so every invalidation of ["performers"] refreshes this too.
  const { data } = useQuery({
    queryKey: qk.performers.withArchived,
    queryFn: () =>
      fetchJson<{ performers: PerformerSummary[] }>(
        "/api/performers?archived=include",
      ),
  });

  // Favourites first, then alphabetical — so a performer stays put as their
  // video count changes; ordering by count meant every scan could reshuffle
  // the whole page. localeCompare so accented names sort next to their base
  // letter. The server orders the same way, but this page re-sorts anyway, so
  // the pin has to be repeated here or it would be thrown away.
  const pinnedIds = new Set(
    readPins()
      .filter((pin) => pin.type === "performer")
      .map((pin) => pin.performerId),
  );
  const order = comparator(sort);
  const all = [...(data?.performers ?? [])].sort(
    (a, b) =>
      Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)) ||
      Number(b.isFavorite) - Number(a.isFavorite) ||
      order(a, b),
  );
  const performers = all.filter((p) => !p.archivedAt);
  const archived = all.filter((p) => p.archivedAt);

  // Unlike the homepage row, zero-video performers are kept: this is the page
  // where you'd go to find one you created by hand, or one whose folder is
  // currently unscanned.
  // Favourited performers get their own section at the top, so they're
  // excluded from the two below rather than appearing twice.
  const needle = query.trim().toLowerCase();
  const matches = (performer: PerformerSummary) =>
    !needle || performer.name.toLowerCase().includes(needle);
  const filtering = needle !== "";
  const visiblePerformers = performers.filter(matches);
  const visibleArchived = archived.filter(matches);
  const isNewFace = (performer: PerformerSummary) =>
    performer.createdAt !== undefined && new Date(performer.createdAt).getTime() >= newFaceCutoff;
  const newFaces = filtering
    ? []
    : [...performers]
        .filter((p) => p.videoCount > 0 && isNewFace(p))
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
        .slice(0, 12);
  // Followed first, then favourites: each section leaves out the ones above
  // it, so nobody appears twice.
  const visibleFollowed = visiblePerformers.filter((p) => p.isFollowed);
  const rest = visiblePerformers.filter((p) => !p.isFollowed);
  const visibleFavorites = rest.filter((p) => p.isFavorite);
  const visibleWithVideos = rest.filter(
    (p) => !p.isFavorite && p.videoCount > 0,
  );
  const visibleEmpty = rest.filter(
    (p) => !p.isFavorite && p.videoCount === 0,
  );

  let sectionCount = 0;
  const sectionNumber = () => String(++sectionCount).padStart(2, "0");

  return (
    <PageScope name="performers">
      <AppShell
        title="Performers"
        subtitle={
          performers.length > 0
            ? `${performers.length} ${performers.length === 1 ? "performer" : "performers"}`
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            {!network && <SearchToggle value={query} onChange={setQuery} />}
            {!network && <SortMenu value={sort} onChange={setSort} />}
            <ViewSwitch view={view} />
          </div>
        }
      >
        {network ? (
          <div className="px-4 py-6 md:px-6 md:py-8">
            <PerformerNetwork
              view={search}
              // Replacing rather than pushing: every hide, filter or drag of
              // the year slider would otherwise be its own back-button stop.
              onViewChange={(patch) =>
                void navigate({
                  to: "/performers",
                  search: (prev) => ({ ...prev, ...patch, view: "network" }),
                  replace: true,
                })
              }
            />
          </div>
        ) : (
        <div className="space-y-12 px-4 py-6 md:px-6 md:py-8">
          {visiblePerformers.length === 0 && archived.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {performers.length === 0
                ? "No performers yet. They're created automatically from your folder names when you scan."
                : "Nobody matches that."}
            </p>
          )}

          {view === "list" ? (
            visiblePerformers.length > 0 && (
              <section className="space-y-5">
                <Kicker n={sectionNumber()} label={filtering ? "Matches" : "Everyone"} />
                <NameList performers={visiblePerformers} onOpen={openPerformer} />
              </section>
            )
          ) : (
          <>
          {/* The stage: who you follow, in a row of their own. */}
          {visibleFollowed.length > 0 && (
            <section className="space-y-5">
              <Kicker n={sectionNumber()} label="Following" />
              <CardRow performers={visibleFollowed} onOpen={openPerformer} />
            </section>
          )}

          {newFaces.length > 0 && (
            <section className="space-y-5">
              <Kicker n={sectionNumber()} label="New faces" />
              <CardRow performers={newFaces} onOpen={openPerformer} isNew={() => true} />
            </section>
          )}

          {visibleFavorites.length > 0 && (
            <section className="space-y-5">
              <Kicker n={sectionNumber()} label="Favourites" />
              <PerformerList
                performers={visibleFavorites}
                onOpen={openPerformer}
                layout={layout}
              />
            </section>
          )}

          {visibleWithVideos.length > 0 && (
            <section className="space-y-5">
              <Kicker n={sectionNumber()} label={filtering ? "Matches" : "Everyone"} />
              <PerformerList
                performers={visibleWithVideos}
                onOpen={openPerformer}
                layout={layout}
              />
            </section>
          )}

          {visibleEmpty.length > 0 && (
            <section className="space-y-5">
              <Kicker n={sectionNumber()} label="No videos right now" />
              <p className="max-w-prose text-xs text-muted-foreground/70">
                Either added by hand, or their folder isn't currently being
                scanned. Their details are kept either way.
              </p>
              <PerformerList
                performers={visibleEmpty}
                onOpen={openPerformer}
                layout={layout}
              />
            </section>
          )}

          </>
          )}

          {visibleArchived.length > 0 && (
            <section className="space-y-5">
              <button
                type="button"
                onClick={() => setShowArchived((open) => !open)}
                aria-expanded={showArchived}
                className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform",
                    showArchived && "rotate-90",
                  )}
                />
                <Archive className="size-3.5" />
                Archived
                <span className="font-normal tabular-nums">
                  {visibleArchived.length}
                </span>
              </button>
              {showArchived && (
                <>
                  <p className="max-w-prose text-xs text-muted-foreground/70">
                    Kept out of the home row, search and the network. Their
                    videos are untouched. Open one to restore them.
                  </p>
                  <div className="opacity-60 transition-opacity hover:opacity-100">
                    <PerformerList
                      performers={visibleArchived}
                      onOpen={openPerformer}
                      layout={layout}
                    />
                  </div>
                </>
              )}
            </section>
          )}
        </div>
        )}
      </AppShell>
    </PageScope>
  );
}
