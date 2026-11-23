// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaRow } from "./MediaRow";
import { AppearanceProvider } from "@/lib/appearance";
import { CardShortcutProvider } from "@/lib/cardShortcuts";
import { QueueProvider } from "@/lib/queue";
import { ToastProvider } from "@/lib/toast";
import type { MediaCardItem } from "./MediaCard";

const items: MediaCardItem[] = [
  {
    id: 1,
    itemType: "video",
    title: "Row video",
    durationSeconds: 120,
    missingSince: null,
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = /\/api\/media-items\/(\d+)$/.test(url)
        ? { ...items[0], performers: [], tags: [], isFavorite: false }
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

function renderRow() {
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
                title="Recently Added"
                items={items}
                onSelectItem={() => {}}
                onOpenFolder={() => {}}
              />
            </CardShortcutProvider>
          </QueueProvider>
        </AppearanceProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

/**
 * The second half of the same regression.
 *
 * The shortcuts first lived inside MediaGrid, so they worked on the browse
 * page and nowhere else — not on the home page, which is what most people
 * land on and which renders its tiles as rows. Hovering a row tile and
 * pressing Space scrolled the page, because nothing was listening.
 */
describe("MediaRow single-key shortcuts", () => {
  it("acts on a hovered tile in a row, not only in the grid", async () => {
    const user = renderRow();
    const card = await screen.findByRole("button", { name: /Row video/ });

    await user.hover(card);
    await user.keyboard(" ");

    expect(
      await screen.findByRole("dialog", { name: /Row video/ }),
    ).toBeInTheDocument();
  });

  it("acts on a focused tile in a row", async () => {
    const user = renderRow();
    const card = await screen.findByRole("button", { name: /Row video/ });

    card.focus();
    await user.keyboard(" ");

    expect(
      await screen.findByRole("dialog", { name: /Row video/ }),
    ).toBeInTheDocument();
  });

  // Nothing is engaged, so there is no target and the key belongs to the page.
  it("leaves the key alone when no tile is engaged", async () => {
    const user = renderRow();
    await screen.findByRole("button", { name: /Row video/ });

    await user.keyboard(" ");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * The third instance of the same regression, and the reason tile shape could
 * not be set from the home page.
 *
 * The right-click menu lived inside MediaGrid, so it existed on the browse
 * page and nowhere else. Right-clicking a tile in a row fell through to the
 * browser's own menu — on a video that is Chrome's "Save Video As / Loop"
 * menu, which is what a user actually saw when told to right-click a tile.
 */
describe("MediaRow right-click menu", () => {
  it("opens the app's own menu on a row tile, not the browser's", async () => {
    const user = renderRow();
    const card = await screen.findByRole("button", { name: /Row video/ });

    await user.pointer({ keys: "[MouseRight]", target: card });

    expect(await screen.findByRole("menu", { name: /Actions/ })).toBeInTheDocument();
  });

  it("offers the tile shape entries there", async () => {
    const user = renderRow();
    const card = await screen.findByRole("button", { name: /Row video/ });

    await user.pointer({ keys: "[MouseRight]", target: card });

    expect(await screen.findByRole("menuitemradio", { name: "Portrait tile" })).toBeInTheDocument();
    expect(await screen.findByRole("menuitemradio", { name: "Landscape tile" })).toBeInTheDocument();
  });

  // The tick has to follow the shape the tile is drawn at, which for an item
  // with none of its own is the Appearance default.
  it("ticks the shape the tile is currently drawn at", async () => {
    const user = renderRow();
    const card = await screen.findByRole("button", { name: /Row video/ });

    await user.pointer({ keys: "[MouseRight]", target: card });

    expect(await screen.findByRole("menuitemradio", { name: "Landscape tile" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await screen.findByRole("menuitemradio", { name: "Portrait tile" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});
