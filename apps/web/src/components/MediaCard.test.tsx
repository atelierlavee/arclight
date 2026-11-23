// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaCard, type MediaCardItem } from "./MediaCard";
import { AppearanceProvider } from "@/lib/appearance";
import { SHAPE_ASPECT } from "@/lib/layout";
import { CardShortcutProvider } from "@/lib/cardShortcuts";
import { QueueProvider } from "@/lib/queue";
import { ToastProvider } from "@/lib/toast";

/**
 * Per-item tile shape (§1).
 *
 * The rule under test is one line in MediaCard — `item.tileShape ?? tileShape`
 * — but it is the whole feature: a shape that leaked to the neighbouring tile,
 * or one that ignored the item and drew the global setting, would both look
 * like "the menu does nothing".
 */

const base: MediaCardItem = {
  id: 1,
  itemType: "video",
  title: "A video",
  durationSeconds: 120,
  missingSince: null,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        // Appearance unset, so the provider keeps its defaults — which means
        // the global shape is landscape and any portrait frame below came
        // from the item itself.
        new Response(JSON.stringify({ appearance: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
});

function renderCard(item: MediaCardItem) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <QueueProvider>
          <AppearanceProvider>
            <CardShortcutProvider>
              <MediaCard item={item} onClick={() => {}} />
            </CardShortcutProvider>
          </AppearanceProvider>
        </QueueProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return container;
}

/** The frame is the one element whose inline style sets an aspect ratio. */
function frameRatio(container: HTMLElement): string | undefined {
  const frame = container.querySelector<HTMLElement>('[style*="aspect-ratio"]');
  return frame?.style.aspectRatio;
}

describe("a tile's own shape", () => {
  // Read from the source rather than restated: the portrait ratio is tuned by
  // eye against the real page, and a hardcoded copy here just fails the build
  // every time it moves.
  const css = (shape: "landscape" | "portrait") =>
    `${SHAPE_ASPECT[shape].w} / ${SHAPE_ASPECT[shape].h}`;

  it("draws the global shape when the item has none", () => {
    expect(frameRatio(renderCard(base))).toBe(css("landscape"));
  });

  it("draws the item's shape when it has one", () => {
    expect(frameRatio(renderCard({ ...base, tileShape: "portrait" }))).toBe(
      css("portrait"),
    );
  });

  // null is what the server sends for "never set", and it has to mean the
  // same as the field being absent rather than collapsing the frame.
  it("treats an explicit null as following the global shape", () => {
    expect(frameRatio(renderCard({ ...base, tileShape: null }))).toBe(css("landscape"));
  });

  // A tile pinned to landscape must stay landscape even once the Appearance
  // setting is portrait — otherwise the pin only works in one direction.
  it("lets an item override the global shape in either direction", () => {
    expect(frameRatio(renderCard({ ...base, tileShape: "landscape" }))).toBe(
      css("landscape"),
    );
  });

  it("does not leak one tile's shape onto another", () => {
    const portrait = renderCard({ ...base, tileShape: "portrait" });
    const plain = renderCard({ ...base, id: 2 });

    expect(frameRatio(portrait)).toBe(css("portrait"));
    expect(frameRatio(plain)).toBe(css("landscape"));
  });
});
