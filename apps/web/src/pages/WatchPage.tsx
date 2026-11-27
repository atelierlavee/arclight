// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { getRouteApi } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MediaPlayer } from "@/components/MediaPlayer";

const routeApi = getRouteApi("/watch/$itemId");

export function WatchPage() {
  const { itemId } = routeApi.useParams();
  const { autoplay = false, resume = false } = routeApi.useSearch();
  const id = Number(itemId);

  return (
    // No page title: the video fills the screen from the very top, under the
    // transparent header, and the masthead over its foot carries the name.
    <AppShell>
      <MediaPlayer
        itemId={id}
        autoPlay={autoplay}
        resume={resume}
        onClose={() => window.history.back()}
      />
    </AppShell>
  );
}
