import { bounds, type Simulation } from "@/lib/forceLayout";
import type { NetworkNode } from "@/lib/performerApi";
import type { View } from "./graph";
import { withAlpha } from "./style";

/** World → minimap coordinates, kept so a click on the map can be mapped back. */
export type MinimapTransform = { scale: number; ox: number; oy: number };

/**
 * The minimap: the whole graph in miniature, with the part in view boxed.
 * Shown only when zoomed in past the point where you can see everything.
 *
 * Reports through `onCovered` whether the view covers the whole graph, and
 * returns the transform it drew with, or null when it drew nothing.
 */
export function drawMinimap(
  canvas: HTMLCanvasElement | null,
  sim: Simulation,
  view: View,
  size: { w: number; h: number },
  graph: { nodes: NetworkNode[] },
  nodesById: Map<number, NetworkNode>,
  colourOf: (node: NetworkNode) => string,
  onCovered: (covered: boolean) => void,
): MinimapTransform | null {
  const { w, h } = size;
  if (sim.nodes.length === 0 || w === 0) return null;
  const box = bounds(sim.nodes);
  const seen = {
    l: -view.x / view.k,
    t: -view.y / view.k,
    r: (w - view.x) / view.k,
    b: (h - view.y) / view.k,
  };
  const covered =
    seen.l <= box.minX && seen.t <= box.minY && seen.r >= box.maxX && seen.b >= box.maxY;
  onCovered(covered);
  const ctx = canvas?.getContext("2d");
  if (covered || !canvas || !ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const mw = canvas.clientWidth;
  const mh = canvas.clientHeight;
  if (canvas.width !== Math.round(mw * dpr)) {
    canvas.width = Math.round(mw * dpr);
    canvas.height = Math.round(mh * dpr);
  }
  const pad = 8;
  const scale = Math.min(
    (mw - pad * 2) / Math.max(1, box.maxX - box.minX),
    (mh - pad * 2) / Math.max(1, box.maxY - box.minY),
  );
  const ox = pad + (mw - pad * 2 - (box.maxX - box.minX) * scale) / 2 - box.minX * scale;
  const oy = pad + (mh - pad * 2 - (box.maxY - box.minY) * scale) / 2 - box.minY * scale;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, mw, mh);
  for (const n of sim.nodes) {
    const node = nodesById.get(n.id);
    if (!node || !graph.nodes.includes(node)) continue;
    ctx.beginPath();
    ctx.arc(ox + n.x * scale, oy + n.y * scale, Math.max(1.5, n.radius * scale), 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(colourOf(node), 0.85);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    ox + seen.l * scale,
    oy + seen.t * scale,
    (seen.r - seen.l) * scale,
    (seen.b - seen.t) * scale,
  );
  return { scale, ox, oy };
}
