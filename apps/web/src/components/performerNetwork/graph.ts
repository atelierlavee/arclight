import type { SimNode } from "@/lib/forceLayout";
import type { NetworkEdge, NetworkNode } from "@/lib/performerApi";
import { OTHER, STUDIO_COLOURS } from "./style";

/**
 * The graph's pure logic: what is drawn for a given set of filters, how two
 * people connect, and the geometry the canvas and its pointer handling share.
 */

export type View = { k: number; x: number; y: number };
export type Hover = { kind: "node"; id: number } | { kind: "edge"; edge: NetworkEdge } | null;
/** What the side panel is showing: one performer, or the pair on a line. */
export type Selection =
  | { kind: "node"; id: number }
  | { kind: "edge"; source: number; target: number }
  | null;
/** Only this performer and whoever is within `depth` links of them. */
export type Focus = { id: number; depth: 1 | 2 } | null;

export type Neighbour = { id: number; together: number; shared?: string[] };
export type Neighbours = Map<number, Neighbour[]>;

/** What is drawn: the nodes and links that survive the view's filters. */
export type NetworkGraph = {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  neighbours: Neighbours;
  focusId: number | null;
  path: number[] | null;
};

export const sameEdge = (a: { source: number; target: number } | null, b: { source: number; target: number } | null) =>
  a != null &&
  b != null &&
  ((a.source === b.source && a.target === b.target) || (a.source === b.target && a.target === b.source));

export const sameHover = (a: Hover, b: Hover) =>
  a?.kind === b?.kind &&
  (a?.kind === "node"
    ? a.id === (b as { id: number }).id
    : a?.kind === "edge"
      ? sameEdge(a.edge, (b as { edge: NetworkEdge }).edge)
      : true);

export const nodeRadius = (node: NetworkNode, scale = 1) =>
  node.kind === "studio"
    ? // A chip is as wide as its name; this is half that, for spacing.
      Math.min(70, 16 + node.name.length * 3.4)
    : // A narrow range, so one prolific performer doesn't dwarf the rest.
      Math.min(26, 12 + 2 * Math.sqrt(node.videoCount)) * scale;

export function distanceToSegment(px: number, py: number, a: SimNode, b: SimNode): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/** Parses the URL's comma-separated id list. */
export const idList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n !== 0);

/** Everyone's neighbours, strongest link first. */
export function neighbourMap(edges: NetworkEdge[]): Neighbours {
  const neighbours: Neighbours = new Map();
  for (const edge of edges) {
    for (const [from, to] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      const list = neighbours.get(from) ?? [];
      list.push({ id: to, together: edge.together, shared: edge.shared });
      neighbours.set(from, list);
    }
  }
  for (const list of neighbours.values()) list.sort((a, b) => b.together - a.together);
  return neighbours;
}

/**
 * The connection between two performers: the fewest steps between them
 * over what is drawn, found breadth-first. `null` when there is none.
 */
export function shortestPath(neighbours: Neighbours, start: number, goal: number): number[] | null {
  const cameFrom = new Map<number, number>([[start, start]]);
  const queue = [start];
  while (queue.length > 0 && !cameFrom.has(goal)) {
    const at = queue.shift()!;
    for (const { id } of neighbours.get(at) ?? []) {
      if (!cameFrom.has(id)) {
        cameFrom.set(id, at);
        queue.push(id);
      }
    }
  }
  if (!cameFrom.has(goal)) return null;
  const path = [goal];
  while (path[0] !== start) path.unshift(cameFrom.get(path[0])!);
  return path;
}

/** Everyone within `depth` links of `id`, themselves included. */
export function withinSteps(edges: NetworkEdge[], id: number, depth: number): Set<number> {
  const keep = new Set([id]);
  let frontier = new Set([id]);
  for (let step = 0; step < depth; step++) {
    const next = new Set<number>();
    for (const edge of edges) {
      for (const [from, to] of [
        [edge.source, edge.target],
        [edge.target, edge.source],
      ]) {
        if (frontier.has(from) && !keep.has(to)) {
          keep.add(to);
          next.add(to);
        }
      }
    }
    frontier = next;
  }
  return keep;
}

/** Applies the view's filters — hidden, focus, isolated — and traces the path. */
export function buildGraph({
  allNodes,
  allEdges,
  hidden,
  focus,
  showIsolated,
  pathEnds,
}: {
  allNodes: NetworkNode[] | undefined;
  allEdges: NetworkEdge[] | undefined;
  hidden: number[];
  focus: Focus;
  showIsolated: boolean;
  pathEnds: readonly [number, number] | null;
}): NetworkGraph {
  const hiddenSet = new Set(hidden);
  let nodes = (allNodes ?? []).filter((node) => !hiddenSet.has(node.id));
  const present = new Set(nodes.map((n) => n.id));
  let edges = (allEdges ?? []).filter(
    (edge) => present.has(edge.source) && present.has(edge.target),
  );

  // Focus: a breadth-first walk out from one performer over the links that
  // survived the filters above, so hiding someone also cuts paths through them.
  const focusId = focus && present.has(focus.id) ? focus.id : null;
  if (focusId != null && focus) {
    const keep = withinSteps(edges, focusId, focus.depth);
    nodes = nodes.filter((node) => keep.has(node.id));
    edges = edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target));
  }

  const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  nodes = nodes.filter((node) => showIsolated || connected.has(node.id) || node.id === focusId);
  const neighbours = neighbourMap(edges);

  let path: number[] | null = null;
  if (pathEnds && pathEnds[0] !== pathEnds[1]) {
    path = shortestPath(neighbours, pathEnds[0], pathEnds[1]);
  }
  return { nodes, edges, neighbours, focusId, path };
}

/**
 * Studios ranked by how many performers they colour, over everyone rather
 * than whoever is on screen, so colours stay put as you filter.
 */
export function rankStudioColours(nodes: NetworkNode[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (node.topStudio && node.kind !== "studio") counts.set(node.topStudio, (counts.get(node.topStudio) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return new Map(ranked.slice(0, STUDIO_COLOURS.length).map(([name], i) => [name, STUDIO_COLOURS[i]]));
}

export const colourIn = (studioColour: Map<string, string>, node: NetworkNode) =>
  (node.topStudio && studioColour.get(node.topStudio)) || OTHER;

/** Where keyboard navigation starts: whoever has the most connections. */
export function mostConnected(graph: Pick<NetworkGraph, "nodes" | "neighbours">): NetworkNode | undefined {
  return [...graph.nodes].sort(
    (a, b) => (graph.neighbours.get(b.id)?.length ?? 0) - (graph.neighbours.get(a.id)?.length ?? 0),
  )[0];
}

/**
 * The neighbour of `fromId` that lies most nearly in direction (dx, dy),
 * or null when nobody lies that way.
 */
export function neighbourToward(
  simNodes: SimNode[],
  neighbours: Neighbours,
  fromId: number,
  dx: number,
  dy: number,
): number | null {
  const from = simNodes.find((n) => n.id === fromId);
  if (!from) return null;
  let best: { id: number; score: number } | null = null;
  for (const { id } of neighbours.get(fromId) ?? []) {
    const to = simNodes.find((n) => n.id === id);
    if (!to) continue;
    const vx = to.x - from.x;
    const vy = to.y - from.y;
    const length = Math.hypot(vx, vy) || 1;
    const alignment = (vx * dx + vy * dy) / length;
    if (alignment < 0.35) continue;
    // Mostly the direction, a little the distance, so a near neighbour
    // slightly off-axis beats a far one dead ahead.
    const score = alignment - length / 4000;
    if (!best || score > best.score) best = { id, score };
  }
  return best?.id ?? null;
}
