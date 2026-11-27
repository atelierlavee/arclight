// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { pkey } from "@/lib/profileStorage";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { EditorialHome, EndCard } from "@/components/home/EditorialHome";
import type { MediaCardItem } from "@/components/MediaCard";
import { openDetails, openWatchPage } from "@/lib/appEvents";
import { PageScope } from "@/lib/appearance";
import { qk } from "@/lib/queryKeys";

type Tag = { id: number; name: string; itemCount?: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// The editorial page shows a short preview of each list; Browse has the rest.
const ROW_LIMIT = 15;

// Folders have no meaningful click target on the home page.
function withoutFolders(items: MediaCardItem[]): MediaCardItem[] {
  return items.filter((i) => i.itemType !== "folder").slice(0, ROW_LIMIT);
}

export function HomePage() {
  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: qk.mediaItems.recent,
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/media-items"),
  });
  const { data: heroData } = useQuery({
    queryKey: qk.heroItems,
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/hero-items"),
  });
  const { data: followingNew, isLoading: followingLoading } = useQuery({
    queryKey: qk.mediaItems.following,
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>("/api/media-items?following=true&watched=false"),
  });
  const { data: recentlyWatched } = useQuery({
    queryKey: qk.mediaItems.recentlyWatched,
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>("/api/media-items?sort=watched&watched=true"),
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

  const recentItems = withoutFolders(recent?.items ?? []);
  // Chosen by the hero setting, resolved server-side.
  const heroItems = heroData?.items ?? [];

  function openItem(id: number, autoPlay: boolean) {
    if (autoPlay) openWatchPage(id);
    else openDetails(id);
  }

  return (
    <PageScope name="home">
      <AppShell>
        <div className="stagger space-y-6 px-4 pb-6 pt-[72px] md:space-y-9 md:px-6 md:pb-8 md:pt-[80px]">
          <EditorialHome
            featured={withoutFolders(heroItems)}
            continueWatching={continueWatching?.items ?? []}
            newForYou={withoutFolders(followingNew?.items ?? [])}
            justAdded={recentItems}
            recentlyWatched={withoutFolders(recentlyWatched?.items ?? [])}
            dailyPick={dailyPick?.item ?? null}
            tags={tagsData?.tags ?? []}
            loading={recentLoading || continueLoading || followingLoading}
            onOpen={openItem}
          />
          {/* The arclight card closes the page. */}
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
      </AppShell>
    </PageScope>
  );
}
