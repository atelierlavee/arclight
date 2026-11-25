// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaRow } from "@/components/MediaRow";
import { AppearanceProvider } from "@/lib/appearance";
import { CardShortcutProvider } from "@/lib/cardShortcuts";
import { PLAY_ITEM_EVENT, type PlayItemDetail } from "@/lib/appEvents";
import { QueueProvider } from "@/lib/queue";
import { ToastProvider } from "@/lib/toast";
import type { MediaCardItem } from "@/components/MediaCard";

const card: MediaCardItem = {
  id: 1,
  itemType: "video",
  title: "Row video",
  durationSeconds: 120,
  missingSince: null,
};

let requests: string[] = [];
/** What the detail endpoint reports, so a toggle's direction can be set up. */
let detail = { isFavorite: false, watched: false };

beforeEach(() => {
  requests = [];
  detail = { isFavorite: false, watched: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push(`${init?.method ?? "GET"} ${url}`);
      const body = /\/api\/media-items\/1$/.test(url)
        ? { ...card, ...detail, performers: [], tags: [] }
        : url.includes("/api/appearance")
          ? { appearance: {} }
          : { items: [], tags: [], performers: [], collections: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

async function hoverCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AppearanceProvider>
          <QueueProvider>
            <CardShortcutProvider>
              <MediaRow
                title="Row"
                items={[card]}
                onSelectItem={() => {}}
                onOpenFolder={() => {}}
              />
            </CardShortcutProvider>
          </QueueProvider>
        </AppearanceProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.hover(await screen.findByRole("button", { name: /Row video/ }));
  return user;
}

describe("card shortcuts", () => {
  /**
   * Every one of these has to leave something on screen.
   *
   * A shortcut with no on-screen control is only discoverable by its result,
   * so one that works silently is indistinguishable from one that is broken —
   * which is exactly how these were reported.
   */
  it("F favourites, and says which way it went", async () => {
    const user = await hoverCard();
    await user.keyboard("f");

    expect(await screen.findByText("Added to Favourites")).toBeInTheDocument();
    expect(requests).toContain("PATCH /api/media-items/1");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  // "Favourite updated" was true and useless. The direction is the whole
  // question when there is no control on screen showing the state.
  it("F says Removed when the item was already a favourite", async () => {
    detail = { isFavorite: true, watched: false };
    const user = await hoverCard();
    await user.keyboard("f");

    expect(
      await screen.findByText("Removed from Favourites"),
    ).toBeInTheDocument();
  });

  it("W marks watched, and says which way it went", async () => {
    const user = await hoverCard();
    await user.keyboard("w");

    expect(await screen.findByText("Marked watched")).toBeInTheDocument();
    expect(requests).toContain("PUT /api/media-items/1/watched");
  });

  it("W says unwatched when the item was already watched", async () => {
    detail = { isFavorite: false, watched: true };
    const user = await hoverCard();
    await user.keyboard("w");

    expect(await screen.findByText("Marked unwatched")).toBeInTheDocument();
  });

  // The queue lives inside the player, so from a grid this otherwise changes
  // nothing visible at all — the one shortcut with no result to see.
  it("Q queues the item and confirms it", async () => {
    const user = await hoverCard();
    await user.keyboard("q");

    expect(await screen.findByText("Added to queue")).toBeInTheDocument();
    expect(sessionStorage.getItem("playback-queue")).toContain("Row video");
  });

  // The shell opens the mini player for a plain play event. Details use the
  // full watch page instead.
  it("E opens the watch page without autoplay", async () => {
    const seen: PlayItemDetail[] = [];
    const listener = (event: Event) =>
      seen.push((event as CustomEvent<PlayItemDetail>).detail);
    window.addEventListener(PLAY_ITEM_EVENT, listener);

    const user = await hoverCard();
    await user.keyboard("e");
    window.removeEventListener(PLAY_ITEM_EVENT, listener);

    expect(seen).toEqual([{ id: 1, watchPage: true }]);
  });

  it("P plays rather than opening the details", async () => {
    const seen: PlayItemDetail[] = [];
    const listener = (event: Event) =>
      seen.push((event as CustomEvent<PlayItemDetail>).detail);
    window.addEventListener(PLAY_ITEM_EVENT, listener);

    const user = await hoverCard();
    await user.keyboard("p");
    window.removeEventListener(PLAY_ITEM_EVENT, listener);

    expect(seen).toEqual([{ id: 1, resume: false }]);
  });

  it("leaves the undo working after the message is chosen", async () => {
    const user = await hoverCard();
    await user.keyboard("f");
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    // Two writes: the change, and putting it back.
    await waitFor(() =>
      expect(
        requests.filter((r) => r === "PATCH /api/media-items/1"),
      ).toHaveLength(2),
    );
  });
});

describe("MediaCard state indicators", () => {
  it("shows a favourite and watched marker on the tile", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AppearanceProvider>
            <QueueProvider>
              <MediaRow
                title="Row"
                items={[{ ...card, isFavorite: true, watched: true }]}
                onSelectItem={() => {}}
                onOpenFolder={() => {}}
              />
            </QueueProvider>
          </AppearanceProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText("Favourite")).toBeInTheDocument();
    expect(screen.getByLabelText("Watched")).toBeInTheDocument();
  });

  it("shows nothing for an item in neither state", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AppearanceProvider>
            <QueueProvider>
              <MediaRow
                title="Row"
                items={[card]}
                onSelectItem={() => {}}
                onOpenFolder={() => {}}
              />
            </QueueProvider>
          </AppearanceProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    await screen.findByRole("button", { name: /Row video/ });
    expect(screen.queryByLabelText("Favourite")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Watched")).not.toBeInTheDocument();
  });
});
