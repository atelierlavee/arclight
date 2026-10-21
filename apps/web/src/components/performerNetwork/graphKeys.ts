import type { Simulation } from "@/lib/forceLayout";
import type { NetworkNode } from "@/lib/performerApi";
import { mostConnected, neighbourToward, type NetworkGraph } from "./graph";

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/**
 * Keyboard: arrows walk to the neighbour that lies that way, Enter opens,
 * F focuses, H hides, and Escape backs out one step at a time.
 */
export function onGraphKeyDown(
  e: React.KeyboardEvent<HTMLDivElement>,
  {
    sim,
    current,
    graph,
    selectPerformer,
    backOut,
    openProfile,
    toggleFocus,
    hide,
  }: {
    sim: Simulation | null;
    /** Whoever is selected, if anyone. */
    current: NetworkNode | undefined;
    graph: NetworkGraph;
    selectPerformer: (id: number) => void;
    /** Escape: undoes the most recent thing still open. */
    backOut: () => void;
    openProfile: (id: number) => void;
    toggleFocus: (id: number) => void;
    hide: (id: number) => void;
  },
) {
  if (e.target !== e.currentTarget) return;
  if (DIRECTIONS[e.key] && sim) {
    e.preventDefault();
    if (!current) {
      // Start from whoever has the most connections.
      const start = mostConnected(graph);
      if (start) selectPerformer(start.id);
      return;
    }
    const [dx, dy] = DIRECTIONS[e.key];
    const next = neighbourToward(sim.nodes, graph.neighbours, current.id, dx, dy);
    if (next != null) selectPerformer(next);
    return;
  }
  if (e.key === "Escape") {
    backOut();
    return;
  }
  if (!current) return;
  if (e.key === "Enter") openProfile(current.id);
  else if (e.key.toLowerCase() === "f") toggleFocus(current.id);
  else if (e.key.toLowerCase() === "h") hide(current.id);
}
