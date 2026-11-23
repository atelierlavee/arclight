// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterChips, FilterMenu } from "./FilterBar";
import { EMPTY_FILTERS, type Filters } from "@/lib/filters";

function renderBar(filters: Filters = EMPTY_FILTERS) {
  const onChange = vi.fn();
  const onClear = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { rerender } = render(
    <QueryClientProvider client={client}>
      {/* Rendered together because they are one feature split across two
          places on the page: the menu sits in the grid's toolbar, the chips
          on a row of their own. */}
      <FilterMenu filters={filters} onChange={onChange} />
      <FilterChips filters={filters} onChange={onChange} onClear={onClear} />
    </QueryClientProvider>,
  );
  return { onChange, onClear, rerender, client };
}

describe("FilterMenu and FilterChips", () => {
  it("shows a chip for every applied filter", () => {
    renderBar({ ...EMPTY_FILTERS, tags: ["indoor"], watched: false });
    expect(
      screen.getByRole("button", { name: "Remove filter Tag: indoor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove filter Unwatched" }),
    ).toBeInTheDocument();
  });

  // §7: never silently reset filters. Removing one chip must leave the rest.
  it("removes only the chip that was clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar({
      ...EMPTY_FILTERS,
      tags: ["indoor", "night"],
      studio: "Acme",
    });

    await user.click(
      screen.getByRole("button", { name: "Remove filter Tag: night" }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["indoor"], studio: "Acme" }),
    );
  });

  it("counts the active filters on the button", () => {
    renderBar({ ...EMPTY_FILTERS, tags: ["a", "b"], favorite: true });
    expect(
      within(screen.getByRole("button", { name: /Filters/ })).getByText("3"),
    ).toBeInTheDocument();
  });

  // With one filter applied the chip's own × already clears it, so a second
  // control beside it would be two buttons doing the same thing.
  it("offers Clear filters only once more than one is applied", () => {
    const { rerender, client } = renderBar({ ...EMPTY_FILTERS, tags: ["a"] });
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={client}>
        <FilterMenu
          filters={{ ...EMPTY_FILTERS, tags: ["a", "b"] }}
          onChange={() => {}}
        />
        <FilterChips
          filters={{ ...EMPTY_FILTERS, tags: ["a", "b"] }}
          onChange={() => {}}
          onClear={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Clear filters")).toBeInTheDocument();
  });

  it("keeps the panel closed until asked (§28)", async () => {
    const user = userEvent.setup();
    renderBar();
    expect(screen.queryByRole("group", { name: "Filters" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.getByRole("group", { name: "Filters" })).toBeInTheDocument();
  });

  it("applies a filter from the panel without disturbing the others", async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar({ ...EMPTY_FILTERS, tags: ["indoor"] });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("button", { name: "Unwatched" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ watched: false, tags: ["indoor"] }),
    );
  });

  // Tri-state: clicking the active choice clears it rather than setting the
  // opposite, which would make "unwatched" impossible to turn off.
  it("clicking an active choice clears it", async () => {
    const user = userEvent.setup();
    const { onChange } = renderBar({ ...EMPTY_FILTERS, watched: false });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("button", { name: "Unwatched" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ watched: undefined }),
    );
  });

  it("closes the panel on Escape and returns focus to its button", async () => {
    const user = userEvent.setup();
    renderBar();
    const button = screen.getByRole("button", { name: /Filters/ });

    await user.click(button);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("group", { name: "Filters" })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});

describe("FilterChips on its own", () => {
  // An unfiltered page should carry no empty bar where the chips would be.
  it("renders nothing when nothing is filtered", () => {
    const { container } = render(
      <FilterChips
        filters={EMPTY_FILTERS}
        onChange={() => {}}
        onClear={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
