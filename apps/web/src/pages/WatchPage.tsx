// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MediaPlayer } from "@/components/MediaPlayer";
import { fetchItem } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";

const routeApi = getRouteApi("/watch/$itemId");

export function WatchPage() {
  const { itemId } = routeApi.useParams();
  const { autoplay = false, resume = false } = routeApi.useSearch();
  const id = Number(itemId);
  const { data: item } = useQuery({
    queryKey: qk.mediaItem.detail(id),
    queryFn: () => fetchItem(id),
  });

  return (
    <AppShell title="Watch">
      <div className="px-4 pt-[60px] md:px-6 md:pt-0">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-4 border-b border-border/70 pb-4">
          <Link
            to="/browse"
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
            Back to library
          </Link>
          <div className="min-w-0 flex-1 text-right sm:text-center">
            <p className="sensitive truncate text-sm font-semibold">
              {item?.title ?? "Loading media…"}
            </p>
            {item?.seasonNumber != null && item.episodeNumber != null && (
              <p className="truncate text-xs text-muted-foreground">
                Season {item.seasonNumber} · Episode {item.episodeNumber}
              </p>
            )}
          </div>
        </div>
      </div>
      <MediaPlayer
        itemId={id}
        autoPlay={autoplay}
        resume={resume}
        onClose={() => window.history.back()}
      />
    </AppShell>
  );
}
