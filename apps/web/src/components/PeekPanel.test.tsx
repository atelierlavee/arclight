// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PeekPanel } from "./PeekPanel";
import { AppearanceProvider } from "@/lib/appearance";
import { QueueProvider } from "@/lib/queue";
import { ToastProvider } from "@/lib/toast";

/** Long enough that a six-line clamp would have cut it. */
const LONG_DESCRIPTION = [
  "First paragraph of a scraped synopsis.",
  "",
  ...Array.from({ length: 12 }, (_, i) => `Line ${i + 1} of the description.`),
].join("\n");

const item = {
  id: 1,
  itemType: "video",
  title: "A video",
  description: null as string | null,
  performers: [],
  tags: [],
  isFavorite: false,
  watched: false,
  durationSeconds: 120,
  lastPositionSeconds: 0,
  studio: null,
  releaseDate: null,
  thumbnailFile: null,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = /\/api\/media-items\/1$/.test(url)
        ? item
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

async function renderPanel() {
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AppearanceProvider>
          <QueueProvider>
            <button type="button">Something behind</button>
            <PeekPanel
              itemId={1}
              onClose={onClose}
              onPlay={() => {}}
            />
          </QueueProvider>
        </AppearanceProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("dialog");
  return { onClose, user: userEvent.setup(), unmount: view.unmount };
}

describe("PeekPanel page scroll", () => {
  it("holds the page still while it is open", async () => {
    await renderPanel();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("gives the scroll back when it closes", async () => {
    const { unmount } = await renderPanel();
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  // Locking the page is not the same as blocking it. A peek differs from the
  // detail modal precisely in that the grid behind stays clickable.
  it("still lets a click reach the page behind", async () => {
    const { onClose, user } = await renderPanel();
    const behind = screen.getByRole("button", { name: "Something behind" });
    const clicked = vi.fn();
    behind.addEventListener("click", clicked);

    await user.click(behind);

    expect(clicked).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("PeekPanel dismissal", () => {
  it("closes on its own button", async () => {
    const { onClose, user } = await renderPanel();
    await user.click(screen.getByRole("button", { name: "Close peek panel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const { onClose, user } = await renderPanel();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * The reported bug.
   *
   * Escape used to require focus to be inside the panel. Clicking anywhere
   * outside moved focus to <body> — and since clicking away did not close it
   * either, the panel became unclosable by every route except its own button.
   * The panel is non-modal by design, so focus leaving it is ordinary rather
   * than a signal to stop listening.
   */
  it("closes on Escape even when focus has left it", async () => {
    const { onClose, user } = await renderPanel();
    (document.activeElement as HTMLElement)?.blur();
    expect(document.activeElement).toBe(document.body);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when you click away", async () => {
    const { onClose, user } = await renderPanel();
    await user.click(screen.getByRole("button", { name: "Something behind" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when you click inside it", async () => {
    const { onClose, user } = await renderPanel();
    await user.click(screen.getByRole("heading", { name: /Tags/i }));
    expect(onClose).not.toHaveBeenCalled();
  });

  // Entering edit mode is a click inside the panel like any other.
  it("stays open when you click Edit", async () => {
    const { onClose, user } = await renderPanel();
    await user.click(screen.getByRole("button", { name: /Edit/ }));
    expect(onClose).not.toHaveBeenCalled();
  });

  // A toast sits above the page too, and clicking its Undo is not "clicking
  // away" — losing the panel mid-correction would be its own small betrayal.
  it("stays open when you click a toast", async () => {
    const { onClose } = await renderPanel();

    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    const button = document.createElement("button");
    toast.append(button);
    document.body.append(toast);

    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
    toast.remove();
  });

  // Escape belongs to whatever is on top. A modal opened over the peek must
  // not have its Escape stolen by the panel underneath.
  it("leaves Escape alone while a modal is open over it", async () => {
    const { onClose, user } = await renderPanel();

    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.append(modal);

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    modal.remove();
  });
});

/**
 * Reading and editing are separate modes (§4's Quick Edit, without the
 * assumption that you came here to type).
 *
 * A peek is what you open to look at something while deciding what to play.
 * Live inputs on arrival invite edits nobody meant to make, and the panel
 * reads as a form rather than as an answer.
 */
describe("PeekPanel edit mode", () => {
  it("opens read-only, with no inputs to fall into", async () => {
    await renderPanel();
    expect(screen.getByRole("heading", { name: "A video" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("offers only Play and Edit", async () => {
    await renderPanel();
    // Scoped to the panel: the harness renders a button behind it, which is
    // the page the peek does not own.
    const labels = within(screen.getByRole("dialog"))
      .getAllByRole("button")
      .map((button) => button.textContent?.trim())
      .filter(Boolean);

    // Close carries an icon and no text, so it is absent from this list.
    expect(labels).toEqual(["Play", "Edit"]);
    expect(
      screen.queryByRole("button", { name: /Favourite|Watched|Queue/ }),
    ).not.toBeInTheDocument();
  });

  it("Edit turns the fields into inputs in place", async () => {
    const { user } = await renderPanel();
    await user.click(screen.getByRole("button", { name: /Edit/ }));

    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Done/ })).toBeInTheDocument();
  });

  it("Done puts it back to reading", async () => {
    const { user } = await renderPanel();
    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await user.click(screen.getByRole("button", { name: /Done/ }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit/ })).toBeInTheDocument();
  });

  // The reported bug: Edit dispatched a play event, so asking to edit opened
  // the mini player and started the video.
  it("Edit plays nothing", async () => {
    const played: unknown[] = [];
    const listener = (event: Event) =>
      played.push((event as CustomEvent).detail);
    window.addEventListener("media-server:play-item", listener);

    const { user } = await renderPanel();
    await user.click(screen.getByRole("button", { name: /Edit/ }));
    window.removeEventListener("media-server:play-item", listener);

    expect(played).toEqual([]);
  });
});

describe("PeekPanel description", () => {
  it("shows the whole thing, with no Read more to click", async () => {
    item.description = LONG_DESCRIPTION;
    await renderPanel();

    // The last line is the one a clamp would have hidden.
    expect(
      screen.getByText(/Line 12 of the description\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Read more/i }),
    ).not.toBeInTheDocument();
    item.description = null;
  });

  it("keeps the paragraph breaks a scraped description arrives with", async () => {
    item.description = LONG_DESCRIPTION;
    await renderPanel();

    const paragraph = screen.getByText(/First paragraph of a scraped synopsis/);
    expect(paragraph).toHaveClass("whitespace-pre-wrap");
    item.description = null;
  });

  it("says so rather than showing an empty section", async () => {
    await renderPanel();
    expect(screen.getByText("No description yet.")).toBeInTheDocument();
  });
});
