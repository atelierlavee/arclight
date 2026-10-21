import { useEffect, useRef, useState } from "react";
import {
  ALPHA_MIN,
  bounds,
  createSimulation,
  settle,
  tick,
  type Simulation,
} from "@/lib/forceLayout";
import type { MotionLevel } from "@/lib/appearance";
import { performerPortraitUrl, type NetworkNode } from "@/lib/performerApi";
import { colourIn, nodeRadius, type View } from "./graph";
import { paintNetwork, type Scene } from "./drawNetwork";
import { drawMinimap, type MinimapTransform } from "./minimap";
import type { Pins } from "./pins";
import { CAMERA_MS, easeInOut } from "./style";

/**
 * The canvas side of the graph: the layout simulation, the camera, portrait
 * loading, and the one animation loop that ties them together.
 *
 * Everything the draw loop reads lives in refs, so the loop is started once
 * and never torn down just because a hover changed.
 */
export function useNetworkCanvas({
  scene,
  motion,
  getPins,
  setPinCount,
}: {
  scene: Scene;
  motion: MotionLevel;
  getPins: () => Pins;
  setPinCount: (count: number) => void;
}) {
  const { graph, hover, selectedId, selectedEdge, discreet, discreetText, look, studioColour, searchHits } = scene;
  const [minimapVisible, setMinimapVisible] = useState(false);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation | null>(null);
  const viewRef = useRef<View>({ k: 1, x: 0, y: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const dirtyRef = useRef(true);
  // Until you pan or zoom, the view keeps re-fitting as the layout settles,
  // so the graph grows into the frame instead of spilling out of it.
  const userMovedRef = useRef(false);
  const imagesRef = useRef(new Map<number, HTMLImageElement | "failed">());

  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  useEffect(() => {
    dirtyRef.current = true;
  }, [graph, hover, selectedId, selectedEdge, discreet, discreetText, studioColour, searchHits]);

  // A new mode, focus or hidden set is a new picture; frame it afresh.
  const reframe = () => {
    userMovedRef.current = false;
  };

  // Camera moves you ask for (fit, jump to someone) glide rather than cut;
  // the continuous re-fit while the layout settles stays immediate.
  const cameraRef = useRef<{ from: View; to: View; start: number } | null>(null);
  const moveCamera = (to: View, animate: boolean) => {
    if (!animate || motion !== "full") {
      cameraRef.current = null;
      viewRef.current = to;
    } else {
      cameraRef.current = { from: { ...viewRef.current }, to, start: performance.now() };
    }
    dirtyRef.current = true;
  };
  // When each circle first appeared, so newcomers fade in.
  const appearedRef = useRef(new Map<number, number>());

  const fit = (animate = false) => {
    const sim = simRef.current;
    const { w, h } = sizeRef.current;
    if (!sim || sim.nodes.length === 0 || w === 0) return;
    const box = bounds(sim.nodes);
    const pad = 48;
    const k = Math.min(
      2,
      (w - pad * 2) / Math.max(1, box.maxX - box.minX),
      (h - pad * 2) / Math.max(1, box.maxY - box.minY),
    );
    moveCamera(
      {
        k,
        x: w / 2 - ((box.minX + box.maxX) / 2) * k,
        y: h / 2 - ((box.minY + box.maxY) / 2) * k,
      },
      animate,
    );
  };

  // A new simulation whenever the visible set changes. Positions carry over
  // for anyone still on screen, so loosening a filter adds people around the
  // existing picture instead of scrambling it.
  useEffect(() => {
    const previous = new Map((simRef.current?.nodes ?? []).map((n) => [n.id, n]));
    const sim = createSimulation(
      graph.nodes.map((node) => ({ id: node.id, radius: nodeRadius(node, look.scale) })),
      graph.edges.map((edge) => ({ source: edge.source, target: edge.target, weight: edge.together })),
    );
    let reused = 0;
    const now = performance.now();
    for (const node of sim.nodes) {
      const old = previous.get(node.id);
      if (old) {
        node.x = old.x;
        node.y = old.y;
        reused++;
      } else if (motion === "full") {
        appearedRef.current.set(node.id, now);
      }
    }
    // Anyone you've dragged into place stays there.
    const pins = getPins();
    for (const node of sim.nodes) {
      const pin = pins[node.id];
      if (pin) {
        node.x = node.fx = pin[0];
        node.y = node.fy = pin[1];
      }
    }
    setPinCount(Object.keys(pins).length);
    if (reused > 0) sim.alpha = 0.5;
    if (motion !== "full") settle(sim);
    simRef.current = sim;
    if (!userMovedRef.current || motion !== "full") fit();
    dirtyRef.current = true;
    // `fit` only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, motion]);

  // Portraits load lazily and redraw the frame when each one arrives.
  useEffect(() => {
    if (discreet) return;
    for (const node of graph.nodes) {
      if (node.kind === "studio" || imagesRef.current.has(node.id)) continue;
      const src = performerPortraitUrl(node);
      if (!src) {
        imagesRef.current.set(node.id, "failed");
        continue;
      }
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        dirtyRef.current = true;
      };
      img.onerror = () => {
        imagesRef.current.set(node.id, "failed");
        dirtyRef.current = true;
      };
      img.src = src;
      imagesRef.current.set(node.id, img);
    }
  }, [graph.nodes, discreet]);

  // Keeps the canvas backing store matched to its box and the screen's
  // pixel density, so lines stay crisp on a retina display.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const first = sizeRef.current.w === 0;
      sizeRef.current = { w: width, h: height };
      if (first || !userMovedRef.current) fit();
      dirtyRef.current = true;
    });
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The one animation loop: advance the layout while it is still moving,
  // and repaint only when something changed.
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const sim = simRef.current;
      if (sim && sim.alpha > ALPHA_MIN) {
        tick(sim);
        if (!userMovedRef.current && !cameraRef.current) fit();
        dirtyRef.current = true;
      }
      const camera = cameraRef.current;
      if (camera) {
        const t = Math.min(1, (performance.now() - camera.start) / CAMERA_MS);
        const e = easeInOut(t);
        viewRef.current = {
          k: camera.from.k + (camera.to.k - camera.from.k) * e,
          x: camera.from.x + (camera.to.x - camera.from.x) * e,
          y: camera.from.y + (camera.to.y - camera.from.y) * e,
        };
        if (t >= 1) cameraRef.current = null;
        dirtyRef.current = true;
      }
      if (appearedRef.current.size > 0) dirtyRef.current = true;
      if (dirtyRef.current) {
        dirtyRef.current = false;
        draw();
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coveredRef = useRef(true);
  const minimapTransform = useRef<MinimapTransform>({ scale: 1, ox: 0, oy: 0 });

  function draw() {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !sim) return;
    const current = sceneRef.current;
    const view = viewRef.current;
    paintNetwork(canvas, ctx, sim, view, current, appearedRef.current, imagesRef.current);
    const transform = drawMinimap(
      minimapRef.current,
      sim,
      view,
      sizeRef.current,
      current.graph,
      current.nodesById,
      (node: NetworkNode) => colourIn(current.studioColour, node),
      (covered) => {
        // State only when it flips, so the draw loop doesn't re-render React.
        if (covered !== coveredRef.current) {
          coveredRef.current = covered;
          setMinimapVisible(!covered);
        }
      },
    );
    if (transform) minimapTransform.current = transform;
  }

  const onMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { scale, ox, oy } = minimapTransform.current;
    const wx = (e.clientX - rect.left - ox) / scale;
    const wy = (e.clientY - rect.top - oy) / scale;
    const { w, h } = sizeRef.current;
    const k = viewRef.current.k;
    userMovedRef.current = true;
    moveCamera({ k, x: w / 2 - wx * k, y: h / 2 - wy * k }, true);
  };

  const centreOn = (id: number) => {
    const node = simRef.current?.nodes.find((n) => n.id === id);
    const { w, h } = sizeRef.current;
    if (!node) return;
    const k = Math.max(viewRef.current.k, 1.2);
    moveCamera({ k, x: w / 2 - node.x * k, y: h / 2 - node.y * k }, true);
    userMovedRef.current = true;
    dirtyRef.current = true;
  };
  /** The fit button: everyone in view, and following the layout again. */
  const fitAll = () => {
    userMovedRef.current = false;
    fit(true);
  };

  /** Lets someone who was placed float with the layout again. */
  const releaseNode = (id: number) => {
    const node = simRef.current?.nodes.find((n) => n.id === id);
    const sim = simRef.current;
    if (node && sim) {
      node.fx = null;
      node.fy = null;
      sim.alpha = Math.max(sim.alpha, 0.3);
    }
  };
  /** Lets everyone float again, and reheats the layout from scratch. */
  const releaseAll = () => {
    const sim = simRef.current;
    if (sim) {
      for (const node of sim.nodes) {
        node.fx = null;
        node.fy = null;
      }
      sim.alpha = 1;
    }
  };

  return {
    containerRef,
    canvasRef,
    minimapRef,
    minimapVisible,
    onMinimapClick,
    simRef,
    viewRef,
    sizeRef,
    dirtyRef,
    userMovedRef,
    sceneRef,
    centreOn,
    fitAll,
    releaseNode,
    releaseAll,
    reframe,
  };
}
