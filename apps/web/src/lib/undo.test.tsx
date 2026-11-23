// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "./toast";
import { useUndoable, type UndoableOptions } from "./undo";

function Harness(options: UndoableOptions<unknown>) {
  const run = useUndoable();
  return (
    <button type="button" onClick={() => void run(options)}>
      Do it
    </button>
  );
}

function renderHarness(options: UndoableOptions<unknown>) {
  render(
    <ToastProvider>
      <Harness {...options} />
    </ToastProvider>,
  );
  return userEvent.setup();
}

describe("useUndoable", () => {
  it("runs the action and offers to reverse it", async () => {
    const apply = vi.fn().mockResolvedValue("previous");
    const revert = vi.fn();
    const user = renderHarness({
      message: "Removed from Favourites",
      apply,
      revert,
    });

    await user.click(screen.getByText("Do it"));

    expect(apply).toHaveBeenCalledOnce();
    expect(await screen.findByText("Removed from Favourites")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(revert).toHaveBeenCalledOnce();
  });

  // The inverse often needs the value it is restoring, and the only moment it
  // exists is before the write. Handing apply's return value to revert is how
  // undoing restores what was there rather than toggling again.
  it("hands what apply returned to revert", async () => {
    const revert = vi.fn();
    const user = renderHarness({
      message: "Changed",
      apply: () => "the old value",
      revert,
    });

    await user.click(screen.getByText("Do it"));
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(revert).toHaveBeenCalledWith("the old value");
  });

  it("refreshes after the action and again after the undo", async () => {
    const onSettled = vi.fn();
    const user = renderHarness({
      message: "Changed",
      apply: () => undefined,
      revert: () => {},
      onSettled,
    });

    await user.click(screen.getByText("Do it"));
    expect(onSettled).toHaveBeenCalledTimes(1);

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(2));
  });

  // A failed action must not claim to have happened, and must not offer to
  // undo something that never took place.
  it("reports a failed action instead of offering an undo", async () => {
    const revert = vi.fn();
    const user = renderHarness({
      message: "Removed from Favourites",
      apply: () => Promise.reject(new Error("Network is down")),
      revert,
    });

    await user.click(screen.getByText("Do it"));

    expect(await screen.findByText("That didn't work")).toBeInTheDocument();
    expect(screen.getByText("Network is down")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(revert).not.toHaveBeenCalled();
  });

  // The user has been told the change is reversed. If it isn't, they need to
  // know the library is not in the state the toast just claimed.
  it("says so when the undo itself fails", async () => {
    const user = renderHarness({
      message: "Changed",
      apply: () => undefined,
      revert: () => Promise.reject(new Error("Still down")),
    });

    await user.click(screen.getByText("Do it"));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Couldn't undo that")).toBeInTheDocument();
    expect(screen.getByText("Still down")).toBeInTheDocument();
  });

  it("uses a custom label where Undo would be vague", async () => {
    const user = renderHarness({
      message: "Queue cleared",
      apply: () => undefined,
      revert: () => {},
      undoLabel: "Put it back",
    });

    await user.click(screen.getByText("Do it"));
    expect(
      await screen.findByRole("button", { name: "Put it back" }),
    ).toBeInTheDocument();
  });
});
