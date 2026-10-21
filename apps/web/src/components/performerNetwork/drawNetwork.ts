import type { Simulation } from "@/lib/forceLayout";
import { circleFraming, unit, type NetworkEdge, type NetworkNode } from "@/lib/performerApi";
import { colourIn, sameEdge, type Hover, type NetworkGraph, type View } from "./graph";
import { easeInOut, FADE_MS, STUDIO_COLOURS, STYLE, withAlpha, type Look } from "./style";

/** Everything a frame is drawn from, besides the layout and the camera. */
export type Scene = {
  graph: NetworkGraph;
  hover: Hover;
  selectedId: number | null;
  selectedEdge: NetworkEdge | null;
  discreet: boolean;
  discreetText: boolean;
  nodesById: Map<number, NetworkNode>;
  look: Look;
  studioColour: Map<string, string>;
  searchHits: Set<number> | null;
};

/**
 * Paints one frame of the graph: background, grid, lines, portraits and
 * names. `appeared` holds when each newcomer arrived, for its fade-in, and
 * loses entries as their fades finish.
 */
export function paintNetwork(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  sim: Simulation,
  view: View,
  scene: Scene,
  appeared: Map<number, number>,
  images: Map<number, HTMLImageElement | "failed">,
) {
  const {
    graph,
    hover,
    selectedId,
    selectedEdge,
    discreet,
    discreetText,
    nodesById,
    look,
    studioColour,
    searchHits,
  } = scene;
  const colourOf = (node: NetworkNode) => colourIn(studioColour, node);
  const dpr = window.devicePixelRatio || 1;
  const px = (n: number) => n / view.k; // screen pixels → world units

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (look.vignette) {
    const g = ctx.createRadialGradient(
      canvas.width / 2, canvas.height * 0.45, 0,
      canvas.width / 2, canvas.height * 0.45, Math.hypot(canvas.width, canvas.height) * 0.6,
    );
    g.addColorStop(0, "#1b1b1d");
    g.addColorStop(1, "#0c0c0d");
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = STYLE.background;
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ambient glows, fixed to the frame rather than the graph, so panning
  // moves the graph across them and the space feels deep, not flat.
  if (look.glows > 0) {
    const w = canvas.width;
    const h = canvas.height;
    const spots: [number, number, number, string][] = [
      [0.15, 0.2, 0.55, STUDIO_COLOURS[0]],
      [0.85, 0.8, 0.6, STUDIO_COLOURS[1]],
      [0.8, 0.15, 0.4, STUDIO_COLOURS[6]],
      [0.25, 0.9, 0.45, STUDIO_COLOURS[4]],
    ];
    for (const [fx, fy, size, colour] of spots) {
      const r = Math.max(w, h) * size;
      const glow = ctx.createRadialGradient(w * fx, h * fy, 0, w * fx, h * fy, r);
      glow.addColorStop(0, withAlpha(colour, look.glows));
      glow.addColorStop(1, withAlpha(colour, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    }
  }

  ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y);

  // The grid lives in graph space, so it pans and zooms with the graph.
  // Its spacing doubles as you zoom out, so it never turns into a haze.
  if (look.grid.minor > 0 || look.grid.major > 0) {
    let spacing = 40;
    while (spacing * view.k < 22) spacing *= 2;
    const major = spacing * 4;
    const left = -view.x / view.k;
    const top = -view.y / view.k;
    const right = left + canvas.width / dpr / view.k;
    const bottom = top + canvas.height / dpr / view.k;
    ctx.lineWidth = 1 / view.k;
    for (const [step, alpha] of [
      [spacing, look.grid.minor],
      [major, look.grid.major],
    ] as const) {
      if (alpha <= 0) continue;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      for (let gx = Math.floor(left / step) * step; gx <= right; gx += step) {
        // The major pass draws these; skipping them here keeps them crisp.
        if (step === spacing && Math.round(gx / major) * major === gx) continue;
        ctx.moveTo(gx, top);
        ctx.lineTo(gx, bottom);
      }
      for (let gy = Math.floor(top / step) * step; gy <= bottom; gy += step) {
        if (step === spacing && Math.round(gy / major) * major === gy) continue;
        ctx.moveTo(left, gy);
        ctx.lineTo(right, gy);
      }
      ctx.stroke();
    }
  }

  const now = performance.now();
  const appear = (id: number) => {
    const at = appeared.get(id);
    if (at == null) return 1;
    const t = (now - at) / FADE_MS;
    if (t >= 1) {
      appeared.delete(id);
      return 1;
    }
    return easeInOut(Math.max(0, t));
  };

  const simById = new Map(sim.nodes.map((n) => [n.id, n]));
  const focusId = hover?.kind === "node" ? hover.id : selectedId;
  const focusEdge = hover?.kind === "edge" ? hover.edge : hover ? null : selectedEdge;
  const lit = new Set<number>();
  if (focusId != null) {
    lit.add(focusId);
    for (const n of graph.neighbours.get(focusId) ?? []) lit.add(n.id);
  }
  if (focusEdge) {
    lit.add(focusEdge.source);
    lit.add(focusEdge.target);
  }
  // A traced connection stays lit until it's cleared, whatever you hover.
  const pathEdges = new Set<string>();
  if (graph.path) {
    for (const id of graph.path) lit.add(id);
    for (let i = 1; i < graph.path.length; i++) {
      const [a, b] = [graph.path[i - 1], graph.path[i]].sort((x, y) => x - y);
      pathEdges.add(`${a}:${b}`);
    }
  }
  if (searchHits && lit.size === 0) for (const id of searchHits) lit.add(id);
  // A search with no hits still dims everything, which is the answer.
  const dimming = lit.size > 0 || searchHits != null;

  // Lines: one hairline weight, brighter for pairs who share more.
  const strongest = Math.max(1, ...graph.edges.map((e) => e.together));
  ctx.lineWidth = px(STYLE.lineWidthPx);
  for (const edge of graph.edges) {
    const a = simById.get(edge.source);
    const b = simById.get(edge.target);
    if (!a || !b) continue;
    const [lo, hi] = edge.source < edge.target ? [edge.source, edge.target] : [edge.target, edge.source];
    const active =
      pathEdges.has(`${lo}:${hi}`) ||
      sameEdge(edge, focusEdge) ||
      (focusId != null && (edge.source === focusId || edge.target === focusId));
    const strength =
      strongest === 1 ? 0 : Math.log(edge.together) / Math.log(strongest);
    const { weakest, strongest: top, active: activeAlpha } = STYLE.lineAlpha;
    const alpha = active ? activeAlpha : dimming ? weakest * 0.5 : weakest + (top - weakest) * strength;
    const fade = Math.min(appear(a.id), appear(b.id));
    const nodeA = nodesById.get(a.id);
    const nodeB = nodesById.get(b.id);
    if ((look.tintedLines || (active && look.studioRings)) && nodeA && nodeB && graph.edges.length <= 800) {
      const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      const tint = Math.min(1, alpha * (look.tintedLines ? 2.2 : 1.2)) * fade;
      gradient.addColorStop(0, withAlpha(colourOf(nodeA), tint));
      gradient.addColorStop(1, withAlpha(colourOf(nodeB), tint));
      ctx.strokeStyle = gradient;
    } else {
      ctx.strokeStyle = `rgba(255,255,255,${alpha * fade})`;
    }
    ctx.lineWidth = px(STYLE.lineWidthPx * (look.tintedLines ? 1.4 : 1) * (active ? 1.4 : 1));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  const labels: { node: NetworkNode; x: number; y: number; r: number; lit: boolean }[] = [];
  for (const simNode of sim.nodes) {
    const node = nodesById.get(simNode.id);
    if (!node) continue;
    const { x, y, radius: r } = simNode;
    const faded = dimming && !lit.has(node.id);
    ctx.globalAlpha = (faded ? STYLE.dimmed : 1) * appear(node.id);
    const active = node.id === focusId || node.id === graph.focusId;

    const colour = colourOf(node);
    if (node.kind === "studio") {
      drawStudioChip(ctx, node.name, x, y, r, active, view.k, discreetText, look.chip, colour);
      continue;
    }

    // Shadow and glow are both a filled circle behind the portrait with a
    // canvas shadow; shadowBlur ignores the transform, so it's in device px.
    const glowing = look.glow > 0 && dimming && lit.has(node.id);
    if (look.shadows || glowing) {
      ctx.save();
      ctx.shadowColor = glowing
        ? withAlpha(look.studioRings ? colour : "#ffffff", node.id === focusId ? 0.75 : 0.4)
        : "rgba(0,0,0,0.6)";
      ctx.shadowBlur = (glowing ? (node.id === focusId ? look.glow : look.glow * 0.55) : 10) * dpr;
      ctx.shadowOffsetY = glowing ? 0 : 3 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = STYLE.placeholder;
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = STYLE.placeholder;
    ctx.fill();
    ctx.clip();
    const img = images.get(node.id);
    if (!discreet && img && img !== "failed" && img.complete && img.naturalWidth > 0) {
      drawPortrait(ctx, img, node, x, y, r);
    } else {
      ctx.fillStyle = STYLE.initials;
      ctx.font = `500 ${r * 0.8}px Inter, ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(node.name.trim()[0]?.toUpperCase() ?? "?", x, y + r * 0.04);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = look.studioRings
      ? withAlpha(colour, active ? 1 : 0.75)
      : active
        ? STYLE.ringActive
        : STYLE.ring;
    ctx.lineWidth = px(look.ringPx * (active ? 1.6 : 1));
    ctx.stroke();

    if (node.isFavorite) {
      ctx.beginPath();
      ctx.arc(x + r * 0.7, y - r * 0.7, Math.max(px(3), r * 0.14), 0, Math.PI * 2);
      ctx.fillStyle = STYLE.favourite;
      ctx.fill();
    }

    if (!discreetText && !faded) labels.push({ node, x, y, r, lit: lit.has(node.id) });
  }
  ctx.globalAlpha = 1;

  // Names go on last, greedily: the people you're looking at first, then
  // the biggest. One that would overlap a name or a circle already placed
  // is skipped rather than drawn into it.
  labels.sort((a, b) => Number(b.lit) - Number(a.lit) || b.r - a.r);
  const placed: { l: number; t: number; r: number; b: number }[] = [];
  const fontPx = px(STYLE.labelPx);
  ctx.font = `450 ${fontPx}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "top";
  for (const { node, x, y, r, lit: isLit } of labels) {
    // Zoomed in far enough, a name becomes a plate with their video count,
    // so close up the graph reads like a wall of profile cards.
    const plate = r * view.k >= look.platesAt;
    ctx.font = `${plate ? 600 : 450} ${fontPx}px Inter, ui-sans-serif, system-ui, sans-serif`;
    const detail = plate ? unit("videos", node.videoCount) : "";
    const width =
      Math.max(ctx.measureText(node.name).width, plate ? ctx.measureText(detail).width * 0.9 : 0) +
      (plate ? px(14) : 0);
    const top = y + r + px(plate ? 6 : 5);
    const height = plate ? fontPx * 2.5 + px(6) : fontPx * 1.25;
    const box = { l: x - width / 2, t: top, r: x + width / 2, b: top + height };
    const clashes =
      placed.some((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t) ||
      sim.nodes.some(
        (c) =>
          c.id !== node.id &&
          c.x + c.radius > box.l && c.x - c.radius < box.r &&
          c.y + c.radius > box.t && c.y - c.radius < box.b,
      );
    if (clashes && !(isLit && node.id === focusId)) continue;
    placed.push(box);
    if (plate) {
      ctx.beginPath();
      ctx.roundRect(box.l, box.t, width, height, px(7));
      ctx.fillStyle = "rgba(10,10,12,0.72)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = px(1);
      ctx.stroke();
      ctx.fillStyle = STYLE.labelActive;
      ctx.fillText(node.name, x, top + px(4));
      ctx.font = `450 ${fontPx * 0.9}px Inter, ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(detail, x, top + px(4) + fontPx * 1.3);
    } else {
      ctx.fillStyle = isLit ? STYLE.labelActive : STYLE.label;
      ctx.fillText(node.name, x, top);
    }
  }
}

/**
 * A studio, drawn as a chip with its name — the same shape as the studio
 * chips on the library page, so it reads as a place rather than a person.
 */
function drawStudioChip(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  r: number,
  active: boolean,
  k: number,
  hideName: boolean,
  style: Look["chip"],
  colour: string,
) {
  const height = STYLE.chipPx * 2.2 / Math.max(k, 0.4);
  const width = r * 2;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
  ctx.fillStyle = STYLE.chip;
  ctx.fill();
  if (style === "tinted") {
    ctx.fillStyle = withAlpha(colour, 0.2);
    ctx.fill();
  }
  ctx.strokeStyle = active
    ? STYLE.ringActive
    : style === "tinted"
      ? withAlpha(colour, 0.7)
      : STYLE.chipBorder;
  ctx.lineWidth = (active ? 1.75 : 1) / k;
  ctx.stroke();
  if (hideName) return;
  ctx.font = `550 ${STYLE.chipPx / Math.max(k, 0.4)}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  const dot = style === "dot" ? (STYLE.chipPx * 0.32) / Math.max(k, 0.4) : 0;
  const textWidth = Math.min(ctx.measureText(name).width, width - 12 / k - dot * 3);
  if (dot) {
    ctx.beginPath();
    ctx.arc(x - textWidth / 2 - dot * 1.6, y, dot, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  }
  ctx.fillStyle = style === "tinted" ? "rgba(255,255,255,0.95)" : STYLE.chipText;
  ctx.fillText(name, x + dot * 0.9, y + 0.5 / k, width - 12 / k - dot * 3);
}

/**
 * Paints a portrait into the node's circle with `object-fit: cover`, honouring
 * the performer's saved framing the same way `portraitStyle` does in CSS.
 */
function drawPortrait(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  node: NetworkNode,
  cx: number,
  cy: number,
  r: number,
) {
  const size = r * 2;
  // Round, so it takes the circle's framing rather than the tiles'.
  const framing = circleFraming(node);
  const px = (framing.imagePositionX ?? 50) / 100;
  const py = (framing.imagePositionY ?? 0) / 100;
  const scale = (framing.imageScale ?? 100) / 100;
  const cover = Math.max(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * cover;
  const h = img.naturalHeight * cover;
  // object-position first, then the zoom about that same point.
  const ox = (size - w) * px;
  const oy = (size - h) * py;
  const left = cx - r;
  const top = cy - r;
  const originX = size * px;
  const originY = size * py;
  ctx.drawImage(
    img,
    left + originX + (ox - originX) * scale,
    top + originY + (oy - originY) * scale,
    w * scale,
    h * scale,
  );
}
