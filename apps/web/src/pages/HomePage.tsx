// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { pkey } from "@/lib/profileStorage";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { EditorialHome, EndCard } from "@/components/home/EditorialHome";
import { CastScene, StudiosScene } from "@/components/home/LibraryScenes";
import type { MediaCardItem } from "@/components/MediaCard";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { ROW_TILE_LIMIT } from "@/lib/rowLimits";
import { MediaRow } from "@/components/MediaRow";
import { useAppearance, PageScope, type HomeRowKey } from "@/lib/appearance";
import { PinnedRow } from "@/components/PinnedRow";
import { qk } from "@/lib/queryKeys";

type Tag = { id: number; name: string; itemCount?: number };
type Collection = { id: number; name: string; type: "manual" | "smart" };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// Rows are a discovery preview — a full browse of a tag/collection happens
// on the Browse page.
const ROW_LIMIT = 15;

// Folders have no meaningful click target in a row-based view.
function withoutFolders(items: MediaCardItem[]): MediaCardItem[] {
  return items.filter((i) => i.itemType !== "folder").slice(0, ROW_LIMIT);
}

function noopOpenFolder() {}

/**
 * Rows the magazine-style top of the page lays out itself. Their switches in
 * Settings → Homepage still decide whether each part appears; the top just
 * arranges them instead of stacking them as rows.
 */
const EDITORIAL_ROWS = new Set<HomeRowKey>(["dailyPick", "continue", "following", "recent"]);

function TagRow({
  tag,
  onSelectItem,
  onPlayItem,
}: {
  tag: Tag;
  onSelectItem: (id: number) => void;
  onPlayItem: (id: number) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: qk.mediaItems.tagRow(tag.name),
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>(`/api/media-items?tag=${encodeURIComponent(tag.name)}`),
  });

  return (
    <MediaRow
      title={tag.name}
      seeMore={{ to: "/browse", search: { tag: tag.name } }}
      items={withoutFolders(data?.items ?? []).slice(0, ROW_TILE_LIMIT)}
      loading={isLoading}
      onSelectItem={onSelectItem}
      onPlayItem={onPlayItem}
      onOpenFolder={noopOpenFolder}
    />
  );
}

function CollectionRow({
  collection,
  onSelectItem,
  onPlayItem,
}: {
  collection: Collection;
  onSelectItem: (id: number) => void;
  onPlayItem: (id: number) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: qk.collectionItems.row(collection.id),
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>(`/api/collections/${collection.id}/items`),
  });

  return (
    <MediaRow
      title={collection.name}
      seeMore={{ to: "/browse", search: { collectionId: collection.id } }}
      items={withoutFolders(data?.items ?? []).slice(0, ROW_TILE_LIMIT)}
      loading={isLoading}
      onSelectItem={onSelectItem}
      onPlayItem={onPlayItem}
      onOpenFolder={noopOpenFolder}
    />
  );
}

export function HomePage() {
  const [open, setOpen] = useState<{ id: number; autoPlay: boolean } | null>(null);

  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: qk.mediaItems.recent,
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/media-items"),
  });
  const { data: heroData } = useQuery({
    queryKey: qk.heroItems,
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/hero-items"),
  });
  const { data: favorites, isLoading: favoritesLoading } = useQuery({
    queryKey: qk.mediaItems.favorites,
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/media-items?favorite=true"),
  });
  const { data: watchLater, isLoading: watchLaterLoading } = useQuery({
    queryKey: qk.mediaItems.watchLater,
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>("/api/media-items?watchLater=true&sort=watchLater"),
  });
  const { data: followingNew, isLoading: followingLoading } = useQuery({
    queryKey: qk.mediaItems.following,
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>("/api/media-items?following=true&watched=false"),
  });
  const { data: recentlyWatched, isLoading: recentlyWatchedLoading } = useQuery({
    queryKey: qk.mediaItems.recentlyWatched,
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>(
        "/api/media-items?sort=watched&watched=true",
      ),
  });
  const { data: mostPlayed, isLoading: mostPlayedLoading } = useQuery({
    queryKey: qk.mediaItems.mostPlayed,
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>(
        "/api/media-items?sort=played&watched=true",
      ),
  });
  const { data: unwatched, isLoading: unwatchedLoading } = useQuery({
    queryKey: qk.mediaItems.unwatched,
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>("/api/media-items?watched=false"),
  });
  /**
   * A shuffle that holds for the session rather than re-rolling per render.
   *
   * The seed is state with a lazy initialiser, so "Random picks" is a
   * different set each time you come back to the home page but the same set
   * while you are on it — a row that reshuffled under the pointer would be
   * unusable.
   */
  const [randomSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const { data: randomPicks, isLoading: randomLoading } = useQuery({
    queryKey: qk.mediaItems.randomPicks(randomSeed),
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>(
        `/api/media-items?sort=random&seed=${randomSeed}`,
      ),
  });
  const { data: continueWatching, isLoading: continueLoading } = useQuery({
    queryKey: qk.continueWatching,
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/continue-watching"),
  });
  const [dailyPickSeed] = useState<number | null>(() => {
    try {
      const stored = sessionStorage.getItem(pkey("dailyPickSeed"));
      return stored ? Number(stored) : null;
    } catch { return null; }
  });
  const { data: dailyPick } = useQuery({
    queryKey: qk.dailyPick.forSeed(dailyPickSeed),
    queryFn: () =>
      fetchJson<{ item: MediaCardItem | null }>(
        dailyPickSeed != null ? `/api/daily-pick?seed=${dailyPickSeed}` : "/api/daily-pick",
      ),
  });
  const { data: tagsData } = useQuery({
    queryKey: qk.tags,
    queryFn: () => fetchJson<{ tags: Tag[] }>("/api/tags"),
  });
  const { data: collectionsData } = useQuery({
    queryKey: qk.collections,
    queryFn: () => fetchJson<{ collections: Collection[] }>("/api/collections"),
  });

  const recentItems = withoutFolders(recent?.items ?? []);
  // Chosen by the hero setting, resolved server-side.
  const heroItems = heroData?.items ?? [];

  const { homeRows } = useAppearance();
  const shown = new Set(homeRows.filter((row) => row.visible).map((row) => row.key));

  function openItem(id: number, autoPlay: boolean) {
    setOpen({ id, autoPlay });
  }

  return (
    <PageScope name="home">
      <AppShell>
        <div className="stagger space-y-6 px-4 pb-6 pt-[72px] md:space-y-9 md:px-6 md:pb-8 md:pt-[80px]">
          <EditorialHome
            featured={withoutFolders(heroItems)}
            continueWatching={shown.has("continue") ? (continueWatching?.items ?? []) : []}
            newForYou={shown.has("following") ? withoutFolders(followingNew?.items ?? []) : []}
            justAdded={shown.has("recent") ? recentItems : []}
            recentlyWatched={withoutFolders(recentlyWatched?.items ?? [])}
            dailyPick={shown.has("dailyPick") ? (dailyPick?.item ?? null) : null}
            tags={tagsData?.tags ?? []}
            loading={recentLoading || continueLoading || followingLoading}
            onOpen={openItem}
          />
          {/* Rendered from the saved order rather than written out in sequence,
              so hiding or moving a section is a data change rather than an edit
              here. Each case returns null when it has nothing, exactly as it did
              before — an empty row was never shown. */}
          {homeRows
            .filter((row) => row.visible && !EDITORIAL_ROWS.has(row.key))
            .map(({ key }) => {
              switch (key) {
                case "watchLater":
                  return (
                    <MediaRow
                      key={key}
                      title="Watch Later"
                      seeMore={{ to: "/browse", search: { watchLater: "true", sort: "watchLater" } }}
                      items={withoutFolders(watchLater?.items ?? []).slice(0, ROW_TILE_LIMIT)}
                      loading={watchLaterLoading}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                      onOpenFolder={noopOpenFolder}
                    />
                  );
                case "favourites":
                  return (
                    <MediaRow
                      key={key}
                      title="Favourites"
                      items={withoutFolders(favorites?.items ?? []).slice(0, ROW_TILE_LIMIT)}
                      loading={favoritesLoading}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                      onOpenFolder={noopOpenFolder}
                    />
                  );
                case "performers":
                  return <CastScene key={key} onOpen={openItem} />;
                case "studios":
                  return <StudiosScene key={key} />;
                case "recentlyWatched":
                  return (
                    <MediaRow
                      key={key}
                      title="Recently Watched"
                      seeMore={{ to: "/browse", search: { sort: "watched" } }}
                      items={withoutFolders(recentlyWatched?.items ?? []).slice(
                        0,
                        ROW_TILE_LIMIT,
                      )}
                      loading={recentlyWatchedLoading}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                      onOpenFolder={noopOpenFolder}
                    />
                  );
                case "unwatched":
                  return (
                    <MediaRow
                      key={key}
                      title="Unwatched"
                      seeMore={{ to: "/browse", search: { watched: "false" } }}
                      items={withoutFolders(unwatched?.items ?? []).slice(
                        0,
                        ROW_TILE_LIMIT,
                      )}
                      loading={unwatchedLoading}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                      onOpenFolder={noopOpenFolder}
                    />
                  );
                case "mostPlayed":
                  return (
                    <MediaRow
                      key={key}
                      title="Most Played"
                      items={withoutFolders(mostPlayed?.items ?? []).slice(0, ROW_TILE_LIMIT)}
                      loading={mostPlayedLoading}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                      onOpenFolder={noopOpenFolder}
                    />
                  );
                case "randomPicks":
                  return (
                    <MediaRow
                      key={key}
                      title="Random Picks"
                      items={withoutFolders(randomPicks?.items ?? []).slice(0, ROW_TILE_LIMIT)}
                      loading={randomLoading}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                      onOpenFolder={noopOpenFolder}
                    />
                  );
                case "pinned":
                  return <PinnedRow key={key} />;
                case "collections":
                  return collectionsData?.collections.map((collection) => (
                    <CollectionRow
                      key={`collection-${collection.id}`}
                      collection={collection}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                    />
                  ));
                case "tags":
                  return tagsData?.tags.map((tag) => (
                    <TagRow
                      key={`tag-${tag.id}`}
                      tag={tag}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                    />
                  ));
              }
            })}
          {/* The arclight card closes the page, after every row and scene. */}
          <div className="-mx-4 md:-mx-6">
            <EndCard
              onOpen={openItem}
              stills={[
                ...withoutFolders(heroItems),
                ...recentItems,
                ...withoutFolders(followingNew?.items ?? []),
                ...(continueWatching?.items ?? []),
              ]}
            />
          </div>
        </div>

        {open && (
          <MediaDetailModal itemId={open.id} autoPlay={open.autoPlay} onClose={() => setOpen(null)} />
        )}
      </AppShell>
    </PageScope>
  );
}
