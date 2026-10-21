import { describe, expect, it } from "vitest";
import type { SimNode } from "@/lib/forceLayout";
import type { NetworkEdge, NetworkNode } from "@/lib/performerApi";
import {
  buildGraph,
  colourIn,
  distanceToSegment,
  idList,
  mostConnected,
  neighbourMap,
  neighbourToward,
  nodeRadius,
  rankStudioColours,
  sameEdge,
  sameHover,
  shortestPath,
  withinSteps,
} from "./graph";
import { OTHER, STUDIO_COLOURS } from "./style";

const node = (id: number, extra: Partial<NetworkNode> = {}) =>
  ({
    id,
    name: `P${id}`,
    hasImage: false,
    hasBanner: false,
    isFavorite: false,
    videoCount: 1,
    representativeItemId: null,
    imagePositionX: 50,
    imagePositionY: 0,
    imageScale: 100,
    topStudio: null,
    ...extra,
  }) as NetworkNode;
const edge = (source: number, target: number, together = 1): NetworkEdge => ({ source, target, together });
const sim = (id: number, x: number, y: number) => ({ id, x, y, vx: 0, vy: 0, radius: 10 }) as SimNode;

// A chain 1–2–3–4, and 5 on its own.
const nodes = [1, 2, 3, 4, 5].map((id) => node(id));
const edges = [edge(1, 2, 3), edge(2, 3, 1), edge(3, 4, 2)];
const base = { allNodes: nodes, allEdges: edges, hidden: [], focus: null, showIsolated: false, pathEnds: null };
const ids = (list: { id: number }[]) => list.map((n) => n.id);

describe("idList", () => {
  it("parses ids and drops junk, zeros and blanks", () => {
    expect(idList("1,-7,x,0,,2.5,3")).toEqual([1, -7, 3]);
    expect(idList(undefined)).toEqual([]);
  });
});

describe("sameEdge / sameHover", () => {
  it("treats a line as the same either way round", () => {
    expect(sameEdge({ source: 1, target: 2 }, { source: 2, target: 1 })).toBe(true);
    expect(sameEdge({ source: 1, target: 2 }, { source: 1, target: 3 })).toBe(false);
    expect(sameEdge(null, { source: 1, target: 2 })).toBe(false);
  });

  it("compares hovers by what they point at", () => {
    expect(sameHover(null, null)).toBe(true);
    expect(sameHover({ kind: "node", id: 1 }, { kind: "node", id: 1 })).toBe(true);
    expect(sameHover({ kind: "node", id: 1 }, { kind: "node", id: 2 })).toBe(false);
    expect(sameHover({ kind: "edge", edge: edge(1, 2) }, { kind: "edge", edge: edge(2, 1) })).toBe(true);
    expect(sameHover({ kind: "node", id: 1 }, null)).toBe(false);
  });
});

describe("nodeRadius", () => {
  it("keeps performers within a narrow range, scaled", () => {
    expect(nodeRadius(node(1, { videoCount: 0 }))).toBe(12);
    expect(nodeRadius(node(1, { videoCount: 10_000 }))).toBe(26);
    expect(nodeRadius(node(1, { videoCount: 0 }), 2)).toBe(24);
  });

  it("sizes a studio chip by its name, capped", () => {
    expect(nodeRadius(node(-1, { kind: "studio", name: "Abc" }))).toBeCloseTo(16 + 3 * 3.4);
    expect(nodeRadius(node(-1, { kind: "studio", name: "x".repeat(100) }))).toBe(70);
  });
});

describe("distanceToSegment", () => {
  it("measures to the nearest point on the segment, clamped to its ends", () => {
    const a = sim(1, 0, 0);
    const b = sim(2, 10, 0);
    expect(distanceToSegment(5, 3, a, b)).toBe(3);
    expect(distanceToSegment(-4, 3, a, b)).toBe(5);
    expect(distanceToSegment(1, 1, a, a)).toBeCloseTo(Math.SQRT2);
  });
});

describe("neighbourMap", () => {
  it("lists both ends' neighbours, strongest link first", () => {
    const map = neighbourMap(edges);
    expect(map.get(2)).toEqual([
      { id: 1, together: 3, shared: undefined },
      { id: 3, together: 1, shared: undefined },
    ]);
    expect(map.has(5)).toBe(false);
  });
});

describe("withinSteps", () => {
  it("walks out the given number of links", () => {
    expect([...withinSteps(edges, 1, 1)].sort()).toEqual([1, 2]);
    expect([...withinSteps(edges, 1, 2)].sort()).toEqual([1, 2, 3]);
  });
});

describe("shortestPath", () => {
  const map = neighbourMap([...edges, edge(1, 4)]);
  it("finds the fewest steps between two people", () => {
    expect(shortestPath(map, 1, 4)).toEqual([1, 4]);
    expect(shortestPath(map, 2, 4)).toEqual([2, 1, 4]);
  });

  it("is null when nothing connects them", () => {
    expect(shortestPath(map, 1, 5)).toBeNull();
  });
});

describe("buildGraph", () => {
  it("leaves out people with no links unless asked for", () => {
    expect(ids(buildGraph(base).nodes)).toEqual([1, 2, 3, 4]);
    expect(ids(buildGraph({ ...base, showIsolated: true }).nodes)).toEqual([1, 2, 3, 4, 5]);
  });

  it("drops hidden people and every line through them", () => {
    const graph = buildGraph({ ...base, hidden: [2] });
    expect(ids(graph.nodes)).toEqual([3, 4]);
    expect(graph.edges).toEqual([edge(3, 4, 2)]);
  });

  it("narrows to a focus's neighbourhood, after hiding", () => {
    const graph = buildGraph({ ...base, focus: { id: 2, depth: 1 } });
    expect(ids(graph.nodes)).toEqual([1, 2, 3]);
    expect(graph.focusId).toBe(2);
    expect(ids(buildGraph({ ...base, focus: { id: 1, depth: 2 } }).nodes)).toEqual([1, 2, 3]);
    // Hiding 2 cuts 1 off from everyone, but the focus itself stays drawn.
    const cut = buildGraph({ ...base, hidden: [2], focus: { id: 1, depth: 2 } });
    expect(ids(cut.nodes)).toEqual([1]);
    expect(cut.edges).toEqual([]);
  });

  it("ignores a focus on someone who isn't there", () => {
    expect(buildGraph({ ...base, hidden: [2], focus: { id: 2, depth: 1 } }).focusId).toBeNull();
  });

  it("traces the path over what is drawn", () => {
    expect(buildGraph({ ...base, pathEnds: [1, 4] }).path).toEqual([1, 2, 3, 4]);
    expect(buildGraph({ ...base, pathEnds: [1, 4], hidden: [3] }).path).toBeNull();
    expect(buildGraph({ ...base, pathEnds: [2, 2] }).path).toBeNull();
  });

  it("copes with no data yet", () => {
    const graph = buildGraph({ ...base, allNodes: undefined, allEdges: undefined });
    expect(graph).toMatchObject({ nodes: [], edges: [], focusId: null, path: null });
  });
});

describe("studio colours", () => {
  it("ranks studios by how many performers they colour, ignoring studio circles", () => {
    const colours = rankStudioColours([
      node(1, { topStudio: "B" }),
      node(2, { topStudio: "B" }),
      node(3, { topStudio: "A" }),
      node(4, { topStudio: "C" }),
      node(-1, { kind: "studio", topStudio: "C" }),
    ]);
    expect([...colours.entries()]).toEqual([
      ["B", STUDIO_COLOURS[0]],
      ["A", STUDIO_COLOURS[1]],
      ["C", STUDIO_COLOURS[2]],
    ]);
    expect(colourIn(colours, node(9, { topStudio: "A" }))).toBe(STUDIO_COLOURS[1]);
    expect(colourIn(colours, node(9, { topStudio: "Z" }))).toBe(OTHER);
    expect(colourIn(colours, node(9))).toBe(OTHER);
  });

  it("gives only as many studios a colour as there are colours", () => {
    const many = Array.from({ length: STUDIO_COLOURS.length + 3 }, (_, i) => node(i + 1, { topStudio: `S${i}` }));
    expect(rankStudioColours(many).size).toBe(STUDIO_COLOURS.length);
  });
});

describe("keyboard navigation", () => {
  const graph = buildGraph(base);

  it("starts from whoever has the most connections", () => {
    expect(mostConnected(graph)?.id).toBe(2);
    expect(mostConnected({ nodes: [], neighbours: new Map() })).toBeUndefined();
  });

  it("steps to the neighbour that lies that way", () => {
    // 2 sits between 1 (left) and 3 (right, slightly up).
    const layout = [sim(1, -100, 0), sim(2, 0, 0), sim(3, 100, -10), sim(4, 100, -200)];
    expect(neighbourToward(layout, graph.neighbours, 2, 1, 0)).toBe(3);
    expect(neighbourToward(layout, graph.neighbours, 2, -1, 0)).toBe(1);
    // Nobody lies below 2, and 4 is not 2's neighbour.
    expect(neighbourToward(layout, graph.neighbours, 2, 0, 1)).toBeNull();
    expect(neighbourToward(layout, graph.neighbours, 9, 1, 0)).toBeNull();
  });
});
