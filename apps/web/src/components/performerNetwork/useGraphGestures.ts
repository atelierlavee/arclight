import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { Simulation } from "@/lib/forceLayout";
import type { NetworkEdge } from "@/lib/performerApi";
import { distanceToSegment, sameHover, type Hover, type Selection, type View } from "./graph";
import type { Scene } from "./drawNetwork";
import type { Pins } from "./pins";

/**
 * Pointer and wheel handling for the graph canvas: hover, click to select,
 * drag to place someone, drag to pan, and pinch or scroll to zoom.
 */
export function useGraphGestures({
  canvasRef,
  containerRef,
  simRef,
  viewRef,
  userMovedRef,
  dirtyRef,
  sceneRef,
  getPins,
  pin,
  hover,
  setHover,
  setSelection,
  closeMenu,
  openProfile,
  openStudioVideos,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  simRef: MutableRefObject<Simulation | null>;
  viewRef: MutableRefObject<View>;
  userMovedRef: MutableRefObject<boolean>;
  dirtyRef: MutableRefObject<boolean>;
  sceneRef: MutableRefObject<Scene>;
  getPins: () => Pins;
  pin: (id: number, x: number, y: number) => void;
  hover: Hover;
  setHover: (hover: Hover) => void;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  closeMenu: () => void;
  openProfile: (id: number) => void;
  openStudioVideos: (edge: { source: number; target: number }) => void;
}) {
  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const view = viewRef.current;
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k };
  };

  const hitTest = (clientX: number, clientY: number): Hover => {
    const sim = simRef.current;
    if (!sim) return null;
    const p = toWorld(clientX, clientY);
    for (let i = sim.nodes.length - 1; i >= 0; i--) {
      const n = sim.nodes[i];
      if (Math.hypot(p.x - n.x, p.y - n.y) <= n.radius) return { kind: "node", id: n.id };
    }
    const simById = new Map(sim.nodes.map((n) => [n.id, n]));
    const tolerance = 5 / viewRef.current.k;
    let best: { edge: NetworkEdge; d: number } | null = null;
    for (const edge of sceneRef.current.graph.edges) {
      const a = simById.get(edge.source);
      const b = simById.get(edge.target);
      if (!a || !b) continue;
      const d = distanceToSegment(p.x, p.y, a, b);
      if (d <= tolerance && (!best || d < best.d)) best = { edge, d };
    }
    return best ? { kind: "edge", edge: best.edge } : null;
  };

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: "drag"; id: number; startX: number; startY: number; moved: boolean }
    | { kind: "pan"; startX: number; startY: number; viewX: number; viewY: number; moved: boolean }
    | { kind: "pinch"; dist: number; k: number; midX: number; midY: number; viewX: number; viewY: number }
    | null
  >(null);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // So the arrow keys and shortcuts reach the graph after any click on it.
    containerRef.current?.focus({ preventScroll: true });
    closeMenu();
    // Only the main button drags, pans and selects; a right-click is the
    // context menu's, and must not also open the side panel.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = e.currentTarget.getBoundingClientRect();

    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      const view = viewRef.current;
      gesture.current = {
        kind: "pinch",
        dist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        k: view.k,
        midX: (p1.x + p2.x) / 2 - rect.left,
        midY: (p1.y + p2.y) / 2 - rect.top,
        viewX: view.x,
        viewY: view.y,
      };
      return;
    }

    const hit = hitTest(e.clientX, e.clientY);
    if (hit?.kind === "node") {
      gesture.current = { kind: "drag", id: hit.id, startX: e.clientX, startY: e.clientY, moved: false };
    } else {
      const view = viewRef.current;
      gesture.current = {
        kind: "pan",
        startX: e.clientX,
        startY: e.clientY,
        viewX: view.x,
        viewY: view.y,
        moved: false,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const g = gesture.current;

    if (!g) {
      const hit = hitTest(e.clientX, e.clientY);
      if (!sameHover(hit, hover)) setHover(hit);
      e.currentTarget.style.cursor = hit ? "pointer" : "grab";
      return;
    }

    if (g.kind === "pinch") {
      const [p1, p2] = [...pointers.current.values()];
      if (!p1 || !p2) return;
      const k = Math.min(4, Math.max(0.1, g.k * (Math.hypot(p1.x - p2.x, p1.y - p2.y) / g.dist)));
      viewRef.current = {
        k,
        x: g.midX - ((g.midX - g.viewX) / g.k) * k,
        y: g.midY - ((g.midY - g.viewY) / g.k) * k,
      };
      userMovedRef.current = true;
      dirtyRef.current = true;
      return;
    }

    const moved = Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 4;
    if (!g.moved && !moved) return;
    g.moved = true;

    if (g.kind === "drag") {
      const sim = simRef.current;
      const node = sim?.nodes.find((n) => n.id === g.id);
      if (!sim || !node) return;
      const p = toWorld(e.clientX, e.clientY);
      node.fx = p.x;
      node.fy = p.y;
      sim.alpha = Math.max(sim.alpha, 0.25);
      // Dragging should move the node, not the camera that is following it.
      userMovedRef.current = true;
    } else {
      viewRef.current = {
        ...viewRef.current,
        x: g.viewX + (e.clientX - g.startX),
        y: g.viewY + (e.clientY - g.startY),
      };
      userMovedRef.current = true;
      e.currentTarget.style.cursor = "grabbing";
    }
    dirtyRef.current = true;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.kind === "pinch") return;

    if (g.kind === "drag") {
      const node = simRef.current?.nodes.find((n) => n.id === g.id);
      if (node && g.moved) {
        // Dropped where you put them, and remembered there.
        pin(node.id, node.x, node.y);
      } else if (node && !getPins()[node.id]) {
        node.fx = null;
        node.fy = null;
      }
      if (!g.moved) {
        setSelection((current) =>
          current?.kind === "node" && current.id === g.id ? null : { kind: "node", id: g.id },
        );
      }
    } else if (!g.moved) {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit?.kind === "edge" && (hit.edge.source < 0 || hit.edge.target < 0)) {
        openStudioVideos(hit.edge);
      } else if (hit?.kind === "edge") {
        setSelection({ kind: "edge", source: hit.edge.source, target: hit.edge.target });
      } else setSelection(null);
    }
    e.currentTarget.style.cursor = "grab";
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit?.kind === "node") openProfile(hit.id);
  };

  // Wheel zoom needs a non-passive listener to stop the page scrolling too.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const view = viewRef.current;
      const k = Math.min(4, Math.max(0.1, view.k * Math.exp(-e.deltaY * 0.0015)));
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      viewRef.current = { k, x: mx - ((mx - view.x) / view.k) * k, y: my - ((my - view.y) / view.k) * k };
      userMovedRef.current = true;
      dirtyRef.current = true;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvasRef, dirtyRef, viewRef, userMovedRef]);

  return { hitTest, gesture, onPointerDown, onPointerMove, onPointerUp, onDoubleClick };
}
