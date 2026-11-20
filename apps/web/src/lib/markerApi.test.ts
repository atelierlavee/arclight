import { describe, expect, it } from "vitest";
import { layoutMarkers, markerAt, markerColor, markerKey, MAX_MARKER_ROWS, type Marker } from "./markerApi";

let nextId = 1;
const marker = (title: string, startSeconds: number, endSeconds: number | null = null): Marker => ({
  id: nextId++,
  mediaItemId: 1,
  title,
  startSeconds,
  endSeconds,
  source: "tpdb",
});

describe("layoutMarkers", () => {
  it("runs a marker with no end to the next one, and the last to the end of the video", () => {
    const segments = layoutMarkers([marker("Missionary", 300), marker("Blowjob", 100)], 1000);
    expect(segments.map((s) => [s.marker.title, s.start, s.end, s.row])).toEqual([
      ["Blowjob", 100, 300, 0],
      ["Missionary", 300, 1000, 0],
    ]);
  });

  it("puts overlapping stretches in separate rows, and no more than the most rows", () => {
    const segments = layoutMarkers(
      [
        marker("Rough", 0, 900),
        marker("A", 100, 200),
        marker("B", 150, 250),
        marker("C", 160, 260),
        marker("D", 300, 400),
      ],
      1000,
    );
    expect(segments.map((s) => s.row)).toEqual([0, 1, 2, 2, 1]);
    expect(Math.max(...segments.map((s) => s.row))).toBeLessThan(MAX_MARKER_ROWS);
  });

  it("clamps to the video and drops what starts past it", () => {
    const segments = layoutMarkers([marker("A", 10, 5000), marker("Late", 2000)], 1000);
    expect(segments).toHaveLength(1);
    expect(segments[0].end).toBe(1000);
    expect(layoutMarkers([marker("A", 10)], 0)).toEqual([]);
  });

  it("does not end a marker at another starting at the same second", () => {
    const segments = layoutMarkers([marker("A", 100), marker("B", 100), marker("C", 400)], 1000);
    expect(segments.map((s) => s.end)).toEqual([400, 400, 1000]);
  });
});

describe("markerAt", () => {
  it("finds the latest-starting marker covering a moment", () => {
    const segments = layoutMarkers([marker("Long", 0, 900), marker("Short", 100, 200)], 1000);
    expect(markerAt(segments, 150)?.title).toBe("Short");
    expect(markerAt(segments, 500)?.title).toBe("Long");
    expect(markerAt(segments, 950)).toBeUndefined();
  });
});

describe("markerKey and markerColor", () => {
  it("treat spellings of one position as the same", () => {
    expect(markerKey("Standing Doggy Style")).toBe(markerKey("Standing Doggystyle"));
    expect(markerColor("Blow Job")).toBe(markerColor("blowjob"));
    expect(markerColor("Missionary")).not.toBe(markerColor("Cowgirl"));
  });
});
