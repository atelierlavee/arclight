// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBody } from "@/components/PageBody";
import { YouTabs } from "@/components/YouTabs";
import { PerformerAvatar } from "@/components/PerformerAvatar";
import { performerPortraitUrl } from "@/lib/performerApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  boardFrom,
  boardPayload,
  moveEntry,
  TIERS,
  type Tier,
  type TierBoard,
  type TierEntry,
  type TierKind,
  type TierPlace,
} from "@/lib/tiers";

const TIER_COLOURS: Record<Tier, string> = {
  S: "bg-rose-500 text-white",
  A: "bg-orange-500 text-white",
  B: "bg-amber-400 text-black",
  C: "bg-lime-400 text-black",
  D: "bg-sky-400 text-black",
};

/** Saved this long after the last change, so a run of drags is one request. */
const SAVE_DELAY_MS = 400;

async function fetchBoard(kind: TierKind): Promise<TierBoard> {
  const res = await fetch(`/api/tiers/${kind}`);
  if (!res.ok) throw new Error(`Failed to load the tier list: ${res.status}`);
  const body = (await res.json()) as { ranked: (TierEntry & { tier: Tier })[]; pool: TierEntry[] };
  return boardFrom(body.ranked, body.pool);
}

async function saveBoard(kind: TierKind, board: TierBoard): Promise<void> {
  const res = await fetch(`/api/tiers/${kind}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tiers: boardPayload(board) }),
  });
  if (!res.ok) throw new Error(`Failed to save: ${res.status}`);
}

/**
 * A personal tier list: drag performers or videos into S to D.
 *
 * Drag with a mouse; on a phone, tap a tile to pick it up and tap a row to
 * put it down. Saved as you go — the whole board at once, a moment after
 * the last move.
 */
export function TiersPage() {
  const [kind, setKind] = useState<TierKind>("performer");
  return (
    <AppShell
      title="Tier list"
      subtitle="Your own ranking. Drag, or tap a tile then tap a row."
      actions={<YouTabs />}
    >
      <PageBody className="space-y-4">
        <div role="tablist" className="flex w-fit rounded-md bg-secondary p-0.5 text-sm">
          {(["performer", "video"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={kind === option}
              onClick={() => setKind(option)}
              className={cn(
                "rounded px-3 py-1 transition-colors",
                kind === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "performer" ? "Performers" : "Videos"}
            </button>
          ))}
        </div>
        {/* Keyed so switching tabs starts from that board's saved state. */}
        <TierBoardView key={kind} kind={kind} />
      </PageBody>
    </AppShell>
  );
}

function TierBoardView({ kind }: { kind: TierKind }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: qk.tiers(kind),
    queryFn: () => fetchBoard(kind),
  });
  // Local edits, once there are any; until then the server's board shows.
  const [edited, setBoard] = useState<TierBoard | null>(null);
  const board = edited ?? data ?? null;
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  function place(id: number, to: TierPlace, beforeId?: number) {
    if (!board) return;
    const next = moveEntry(board, id, to, beforeId);
    if (next === board) return;
    setBoard(next);
    setSelected(null);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveBoard(kind, next)
        .then(() => queryClient.setQueryData(qk.tiers(kind), next))
        .catch((error: unknown) => {
          toast({
            title: "Couldn’t save the tier list",
            description: error instanceof Error ? error.message : undefined,
            variant: "error",
          });
          setBoard(null);
          void refetch();
        });
    }, SAVE_DELAY_MS);
  }

  /** Pool additions from the video search: they join the pool, unranked. */
  function addToPool(entry: TierEntry) {
    setBoard((previous) => {
      const current = previous ?? data ?? null;
      return current && !current.pool.some((e) => e.id === entry.id) && !TIERS.some((t) => current.rows[t].some((e) => e.id === entry.id))
        ? { ...current, pool: [entry, ...current.pool] }
        : current;
    });
  }

  if (isLoading || !board) return <div className="skeleton h-80 rounded-lg" />;

  const needle = filter.trim().toLowerCase();
  const pool = needle
    ? board.pool.filter((entry) => (entry.name ?? entry.title ?? "").toLowerCase().includes(needle))
    : board.pool;

  function dropProps(to: TierPlace, beforeId?: number) {
    return {
      onDragOver: (event: React.DragEvent) => {
        if (dragging !== null) event.preventDefault();
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (dragging !== null) place(dragging, to, beforeId);
        setDragging(null);
      },
    };
  }

  function tile(entry: TierEntry, where: TierPlace) {
    return (
      <Tile
        key={entry.id}
        kind={kind}
        entry={entry}
        selected={selected === entry.id}
        dragging={dragging === entry.id}
        onDragStart={() => setDragging(entry.id)}
        onDragEnd={() => setDragging(null)}
        onClick={() => {
          // With something picked up, a tap on another tile places it there.
          if (selected !== null && selected !== entry.id) place(selected, where, entry.id);
          else setSelected(selected === entry.id ? null : entry.id);
        }}
        dropProps={dropProps(where, entry.id)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-lg border border-border">
        {TIERS.map((tier) => (
          <div
            key={tier}
            {...dropProps(tier)}
            onClick={() => selected !== null && place(selected, tier)}
            className={cn(
              "flex min-h-24 border-b border-border last:border-b-0",
              selected !== null && "cursor-pointer hover:bg-accent/40",
            )}
          >
            <div
              className={cn(
                "flex w-14 shrink-0 items-center justify-center text-2xl font-black sm:w-20",
                TIER_COLOURS[tier],
              )}
            >
              {tier}
            </div>
            <div className="flex flex-1 flex-wrap content-start gap-2 p-2">
              {board.rows[tier].map((entry) => tile(entry, tier))}
            </div>
          </div>
        ))}
      </div>

      <section
        {...dropProps("pool")}
        onClick={() => selected !== null && place(selected, "pool")}
        className="space-y-3 rounded-lg border border-dashed border-border p-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">
            Unranked <span className="font-normal text-muted-foreground">{board.pool.length}</span>
          </h2>
          <div className="flex min-w-48 flex-1 items-center gap-2 rounded-md bg-secondary px-2 py-1">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              placeholder={kind === "performer" ? "Filter performers…" : "Filter, or search the library below…"}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {kind === "performer"
            ? "Everyone with a video, favourites first. Drop a tile here to unrank it."
            : "Videos you've watched, favourited or rated. Drop a tile here to unrank it."}
        </p>
        <div className="flex flex-wrap gap-2">{pool.map((entry) => tile(entry, "pool"))}</div>
        {kind === "video" && needle.length >= 2 && <VideoSearch query={needle} board={board} onAdd={addToPool} />}
      </section>
    </div>
  );
}

function Tile({
  kind,
  entry,
  selected,
  dragging,
  onDragStart,
  onDragEnd,
  onClick,
  dropProps,
}: {
  kind: TierKind;
  entry: TierEntry;
  selected: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  dropProps: { onDragOver: (event: React.DragEvent) => void; onDrop: (event: React.DragEvent) => void };
}) {
  const label = entry.name ?? entry.title ?? "";
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", label);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      {...dropProps}
      title={label}
      aria-pressed={selected}
      className={cn(
        "flex cursor-grab flex-col items-center gap-1 rounded-md p-1 outline-none transition-all active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring",
        kind === "performer" ? "w-[72px]" : "w-32",
        selected && "bg-accent ring-2 ring-white/70",
        dragging && "opacity-40",
      )}
    >
      {kind === "performer" ? (
        <PerformerAvatar
          name={label}
          src={performerPortraitUrl({
            id: entry.id,
            hasImage: entry.hasImage ?? false,
            hasBanner: entry.hasBanner ?? false,
            representativeItemId: entry.representativeItemId ?? null,
          })}
          className="pointer-events-none size-14"
        />
      ) : (
        <img
          src={thumbnailUrl(entry)}
          alt=""
          draggable={false}
          className="sensitive pointer-events-none aspect-video w-full rounded object-cover"
        />
      )}
      <span className="sensitive w-full truncate text-center text-[11px] leading-tight">{label}</span>
    </button>
  );
}

/** Library search for videos not yet in the pool, added to it with a click. */
function VideoSearch({
  query,
  board,
  onAdd,
}: {
  query: string;
  board: TierBoard;
  onAdd: (entry: TierEntry) => void;
}) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const { data } = useQuery({
    queryKey: qk.tierSearch(debounced),
    queryFn: async () => {
      const res = await fetch(`/api/media-items?${new URLSearchParams({ type: "video", q: debounced })}`);
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      return ((await res.json()) as { items: TierEntry[] }).items;
    },
  });
  const onBoard = new Set([...board.pool, ...TIERS.flatMap((tier) => board.rows[tier])].map((entry) => entry.id));
  const hits = (data ?? []).filter((entry) => !onBoard.has(entry.id)).slice(0, 12);
  if (hits.length === 0) return null;
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">From the library — click to add to the pool:</p>
      <div className="flex flex-wrap gap-2">
        {hits.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAdd({
                id: entry.id,
                title: entry.title,
                thumbnailFile: entry.thumbnailFile,
                durationSeconds: entry.durationSeconds,
              });
            }}
            title={entry.title}
            className="w-32 rounded-md p-1 text-left opacity-80 transition-opacity hover:opacity-100"
          >
            <img src={thumbnailUrl(entry)} alt="" className="sensitive aspect-video w-full rounded object-cover" />
            <span className="sensitive block truncate text-[11px]">{entry.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
