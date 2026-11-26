// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SeekStrip } from "./SeekStrip";

const flat = () => new Array<number>(50).fill(0);

function strip(props: Partial<React.ComponentProps<typeof SeekStrip>> = {}) {
  return render(
    <SeekStrip
      duration={100}
      currentTime={0}
      sprite={undefined}
      bookmarks={[]}
      visible
      onSeek={() => {}}
      {...props}
    />,
  );
}

describe("SeekStrip best part", () => {
  it("offers the button once a part has been replayed", async () => {
    const heatmap = flat();
    heatmap[20] = 5;
    const onJumpToBest = vi.fn();
    strip({ heatmap, onJumpToBest });

    await userEvent.click(screen.getByRole("button", { name: /best part/i }));
    expect(onJumpToBest).toHaveBeenCalledTimes(1);
  });

  it("hides the button when nothing has been replayed", () => {
    strip({ heatmap: flat(), onJumpToBest: () => {} });
    expect(screen.queryByRole("button", { name: /best part/i })).toBeNull();
  });

  it("hides the button when there is no handler", () => {
    const heatmap = flat();
    heatmap[20] = 5;
    strip({ heatmap });
    expect(screen.queryByRole("button", { name: /best part/i })).toBeNull();
  });
});

describe("SeekStrip heatmap curve", () => {
  /** The curve's points, read back from the end of each segment of its path. */
  function curvePoints(container: HTMLElement): [number, number][] {
    const line = container.querySelector("svg path[fill='none']");
    const d = line?.getAttribute("d") ?? "";
    const start = /^M([\d.]+),([\d.]+)/.exec(d);
    const ends = [...d.matchAll(/ ([\d.]+),([\d.]+)(?= C|$)/g)];
    return [
      ...(start ? [[Number(start[1]), Number(start[2])] as [number, number]] : []),
      ...ends.map((m) => [Number(m[1]), Number(m[2])] as [number, number]),
    ];
  }

  it("lies flat on the bar where nothing was watched and peaks at the most-watched part", () => {
    const heatmap = flat();
    heatmap[3] = 4;
    heatmap[4] = 2;
    const { container } = strip({ heatmap });
    const points = curvePoints(container);

    expect(points).toHaveLength(50);
    expect(points[0][1]).toBe(100);
    expect(points[3][1]).toBeCloseTo(8);
    expect(points[4][1]).toBeCloseTo(54);
    expect(points[20][1]).toBe(100);
  });
});
