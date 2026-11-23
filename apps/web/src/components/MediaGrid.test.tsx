// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaGrid } from "./MediaGrid";
import { AppearanceProvider } from "@/lib/appearance";
import { QueueProvider } from "@/lib/queue";
import { ToastProvider } from "@/lib/toast";
import { CardShortcutProvider } from "@/lib/cardShortcuts";

const items = [
  {
    id: 1,
    itemType: "video",
    title: "First video",
    durationSeconds: 120,
    missingSince: null,
  },
  {
    id: 2,
    itemType: "video",
    title: "Second video",
    durationSeconds: 240,
    missingSince: null,
  },
];

beforeEach(() => {
  // Everything the grid and the panels behind it reach for. Anything not
  // matched here returns an empty list rather than throwing, so a component
  // fetching something new fails its own assertion rather than this setup.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/media-items?")
        ? { items, page: 1, pageSize: 50, hasMore: false }
        : /\/api\/media-items\/(\d+)$/.test(url)
          ? (() => {
              // By id, not always the first — the peek panel names itself
              // after the item it loaded, so serving one item for every
              // request makes "did the right card respond" untestable.
              const id = Number(url.match(/\/api\/media-items\/(\d+)$/)![1]);
              const item = items.find((entry) => entry.id === id) ?? items[0];
              return { ...item, performers: [], tags: [], isFavorite: false };
            })()
          : url.includes("/api/appearance")
            ? { appearance: {} }
            : { items: [], tags: [], performers: [], collections: [], years: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

function renderGrid() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AppearanceProvider>
          <QueueProvider>
            <CardShortcutProvider>
            <MediaGrid
              source={{
                type: "library",
                tag: null,
                performer: null,
                studio: null,
                kind: null,
                q: null,
                parentId: null,
              }}
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

describe("MediaGrid single-key shortcuts", () => {
  /**
   * The regression this file exists for.
   *
   * The shortcuts were bound to the grid container's onKeyDown, which only
   * fires for events bubbling from something focused inside it. With a mouse
   * nothing in the grid is focused at all — hovering a tile and pressing a
   * key sent it to <body>, where nothing was listening, and every shortcut
   * silently did nothing.
   */
  it("acts on the hovered card even though hovering focuses nothing", async () => {
    const user = renderGrid();
    const card = await screen.findByRole("button", { name: /First video/ });

    await user.hover(card);
    expect(document.activeElement).toBe(document.body);

    await user.keyboard(" ");

    // Space peeks, so the panel opening is the proof the key arrived.
    expect(
      await screen.findByRole("dialog", { name: /First video/ }),
    ).toBeInTheDocument();
  });

  it("still acts on the focused card when one is focused", async () => {
    const user = renderGrid();
    const second = await screen.findByRole("button", { name: /Second video/ });

    second.focus();
    await user.keyboard(" ");

    expect(
      await screen.findByRole("dialog", { name: /Second video/ }),
    ).toBeInTheDocument();
  });

  // Otherwise a keyboard user tabbing through the grid gets hijacked by
  // wherever the pointer happens to be resting.
  it("prefers the focused card over the hovered one", async () => {
    const user = renderGrid();
    const first = await screen.findByRole("button", { name: /First video/ });
    const second = await screen.findByRole("button", { name: /Second video/ });

    await user.hover(first);
    second.focus();
    await user.keyboard(" ");

    expect(
      await screen.findByRole("dialog", { name: /Second video/ }),
    ).toBeInTheDocument();
  });

  // A window-level listener is a menace unless it knows when to stand down:
  // the peek panel, the detail modal and the context menu each bind these
  // same keys, and the grid must not act behind them.
  it("stands down once something is open over the grid", async () => {
    const user = renderGrid();
    const card = await screen.findByRole("button", { name: /First video/ });

    await user.hover(card);
    await user.keyboard(" ");
    await screen.findByRole("dialog", { name: /First video/ });

    // `e` is the grid's "open the full details" binding. With the panel open
    // it must do nothing — nothing in the panel handles it either, so a
    // second dialog appearing would be the grid acting from underneath.
    await user.keyboard("e");
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
  });

  it("ignores a shortcut typed into a field", async () => {
    const user = renderGrid();
    const card = await screen.findByRole("button", { name: /First video/ });
    await user.hover(card);

    // The bulk bar's tag input lives inside this same subtree, so a letter
    // typed there must not act on a card.
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    await user.keyboard("e");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    input.remove();
  });
});

/**
 * The period filter reaching the server.
 *
 * The timeline navigates, which changes the search string but not the
 * pathname — and AppShell keys its main region on the pathname, so the grid
 * re-renders without remounting. It used to seed `year` into state once and
 * never look at the prop again, so the new period never reached the query.
 * The month did (it was read straight from the prop), and the server ignores
 * a month with no year, so picking one filtered nothing at all.
 */
describe("MediaGrid period filter", () => {
  function gridWith(props: { year?: string; month?: number }) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AppearanceProvider>
            <QueueProvider>
              <CardShortcutProvider>
                <MediaGrid
                  source={{
                    type: "library",
                    tag: null,
                    performer: null,
                    studio: null,
                    kind: null,
                    q: null,
                    parentId: null,
                  }}
                  onOpenFolder={() => {}}
                  {...props}
                />
              </CardShortcutProvider>
            </QueueProvider>
          </AppearanceProvider>
        </ToastProvider>
      </QueryClientProvider>
    );
  }

  const listRequests = () =>
    (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes("/api/media-items?"));

  it("sends a period chosen after mount", async () => {
    const { rerender } = render(gridWith({}));
    await waitFor(() => expect(listRequests().length).toBeGreaterThan(0));

    rerender(gridWith({ year: "2019", month: 3 }));

    await waitFor(() => {
      const latest = listRequests().at(-1) ?? "";
      expect(latest).toContain("year=2019");
      expect(latest).toContain("month=3");
    });
  });

  it("drops the period again when it is cleared", async () => {
    const { rerender } = render(gridWith({ year: "2019" }));
    await waitFor(() =>
      expect(listRequests().at(-1) ?? "").toContain("year=2019"),
    );

    rerender(gridWith({}));

    await waitFor(() => {
      const latest = listRequests().at(-1) ?? "";
      expect(latest).not.toContain("year=");
      expect(latest).not.toContain("month=");
    });
  });

  // One period control, not two. A plain Year select used to sit in this
  // toolbar as well as the timeline on the browse page.
  it("offers the timeline and no separate year select", async () => {
    render(gridWith({}));
    expect(
      await screen.findByRole("button", { name: /Timeline/ }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Year")).not.toBeInTheDocument();
  });
});
