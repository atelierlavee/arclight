// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
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
    // Back sits with the header's other controls.
    <AppShell
      actions={
        <Link
          to="/browse"
          onClick={(event) => {
            // Back to wherever you came from when there is somewhere; the
            // library when the page was opened directly.
            if (window.history.length > 1) {
              event.preventDefault();
              window.history.back();
            }
          }}
          aria-label="Back"
          title="Back (Esc)"
          className="flex h-9 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Back</span>
        </Link>
      }
    >
      <MediaPlayer
        itemId={id}
        autoPlay={autoplay}
        resume={resume}
        onClose={() => window.history.back()}
      />
    </AppShell>
  );
}
