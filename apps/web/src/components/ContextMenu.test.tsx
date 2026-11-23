// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";

function renderMenu(entries: ContextMenuEntry[]) {
  const onClose = vi.fn();
  render(
    <ContextMenu state={{ x: 10, y: 10, entries }} onClose={onClose} />,
  );
  return { onClose, user: userEvent.setup() };
}

const action = (label: string, onSelect = vi.fn()) => ({ label, onSelect });

describe("ContextMenu", () => {
  it("renders nothing when closed", () => {
    render(<ContextMenu state={null} onClose={() => {}} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("runs the chosen action and closes", async () => {
    const onSelect = vi.fn();
    const { onClose, user } = renderMenu([action("Play", onSelect)]);

    await user.click(screen.getByRole("menuitem", { name: "Play" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("walks the items with the arrow keys and runs one on Enter", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { user } = renderMenu([action("Play", first), action("Peek", second)]);

    await user.keyboard("{ArrowDown}{Enter}");
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it("wraps around at the ends", async () => {
    const first = vi.fn();
    const { user } = renderMenu([action("Play", first), action("Peek")]);

    // Up from the first item lands on the last, and up again on the first.
    await user.keyboard("{ArrowUp}{ArrowUp}{Enter}");
    expect(first).toHaveBeenCalledOnce();
  });

  // A separator is not a stop on the way down; skipping it is what keeps the
  // highlight on something selectable.
  it("skips separators and disabled items when moving", async () => {
    const enabled = vi.fn();
    const { user } = renderMenu([
      { label: "Play", onSelect: vi.fn(), disabled: true },
      { separator: true },
      action("Peek", enabled),
    ]);

    await user.keyboard("{Enter}");
    expect(enabled).toHaveBeenCalledOnce();
  });

  it("does nothing when a disabled item is clicked", async () => {
    const onSelect = vi.fn();
    const { onClose, user } = renderMenu([
      { label: "Play", onSelect, disabled: true },
    ]);

    await user.click(screen.getByRole("menuitem", { name: "Play" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const { onClose, user } = renderMenu([action("Play")]);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("takes focus on open, so the keyboard reaches it", () => {
    renderMenu([action("Play")]);
    expect(screen.getByRole("menu")).toHaveFocus();
  });

  it("closes when the page scrolls out from under it", () => {
    const { onClose } = renderMenu([action("Play")]);
    window.dispatchEvent(new Event("scroll"));
    expect(onClose).toHaveBeenCalled();
  });
});
