import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAppearance } from "@/lib/appearance";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { ContextMenu, type ContextMenuState } from "@/components/ContextMenu";
import {
  fetchPerformerNetwork,
  withStudioCircles,
  type NetworkMode,
  type NetworkNode,
  type NetworkView,
} from "@/lib/performerApi";
import { cn } from "@/lib/utils";
import { EdgeHoverCard, NetworkHighlights, NodeHoverCard } from "./PerformerNetworkPanels";
import {
  buildGraph,
  idList,
  rankStudioColours,
  sameEdge,
  type Focus,
  type Hover,
  type Selection,
} from "./performerNetwork/graph";
import { LOOK, STYLE } from "./performerNetwork/style";
import { onGraphKeyDown } from "./performerNetwork/graphKeys";
import { nodeMenuEntries } from "./performerNetwork/networkMenu";
import { usePins } from "./performerNetwork/usePins";
import { useNetworkNavigation } from "./performerNetwork/useNetworkNavigation";
import { useNetworkPlayback } from "./performerNetwork/useNetworkPlayback";
import { useNetworkCanvas } from "./performerNetwork/useNetworkCanvas";
import { useGraphGestures } from "./performerNetwork/useGraphGestures";
import { NetworkToolbar } from "./performerNetwork/NetworkToolbar";
import { NetworkFilterChips } from "./performerNetwork/NetworkFilterChips";
import { GraphControls } from "./performerNetwork/GraphControls";
import { GraphStatus } from "./performerNetwork/GraphStatus";
import { SelectionPanels } from "./performerNetwork/SelectionPanels";
import { qk } from "@/lib/queryKeys";

/**
 * Who appears with whom, across the whole library.
 *
 * Drawn on a canvas rather than as DOM nodes: a few hundred avatars and every
 * line between them, re-laid out sixty times a second while the simulation
 * settles, is the one place in the app where elements would be too slow.
 *
 * The canvas sidesteps the discreet-mode stylesheet (which blurs `img`
 * elements), so it honours the setting itself: initials instead of pictures
 * with discreet mode on, and no names drawn when names are blurred too.
 *
 * This component holds the view's state and wires the pieces together; the
 * graph logic, drawing, and pointer handling live in `./performerNetwork`.
 */
export function PerformerNetwork({
  view,
  onViewChange,
}: {
  view: NetworkView;
  onViewChange: (patch: NetworkView) => void;
}) {
  const { discreet, discreetText, motion } = useAppearance();
  const mode: NetworkMode = view.by ?? "studios";
  const { data: fetched, isLoading } = useQuery({
    queryKey: qk.performers.network(mode),
    queryFn: () => fetchPerformerNetwork(mode),
    // The old graph stays up while the new mode loads, so switching modes
    // morphs the picture rather than blanking it.
    placeholderData: keepPreviousData,
  });
  // Studio mode can also draw the studios themselves, linked to who works
  // for them, instead of linking performers who share one. Off by default:
  // the graph reads better as faces alone.
  const studioCircles = view.studios === 1;
  const look = LOOK;
  const circles = mode === "studios" && studioCircles;
  // Only trust the edges once they belong to the mode being asked for;
  // until then, the previous mode's counts would be labelled wrongly.
  const data = useMemo(() => {
    if (!fetched) return undefined;
    if (fetched.by !== mode) return { ...fetched, edges: [] };
    return circles ? withStudioCircles(fetched) : fetched;
  }, [fetched, mode, circles]);

  // The view's settings, from the URL. Memoised on the raw strings, so an
  // unchanged URL never looks like a new filter and rebuilds the layout.
  const hiddenKey = view.hidden;
  const hidden = useMemo(() => idList(hiddenKey), [hiddenKey]);
  const focusKey = view.focus;
  const depthKey = view.depth;
  const focus: Focus = useMemo(
    () => (focusKey != null ? { id: focusKey, depth: depthKey === 2 ? 2 : 1 } : null),
    [focusKey, depthKey],
  );
  const pathKey = view.path;
  const pathEnds = useMemo(() => {
    const [a, b] = idList(pathKey);
    return a != null && b != null ? ([a, b] as const) : null;
  }, [pathKey]);

  const setFocus = (next: Focus) =>
    onViewChange({ focus: next?.id, depth: next?.depth === 2 ? 2 : undefined });
  const setHidden = (next: number[]) =>
    onViewChange({ hidden: next.length > 0 ? next.join(",") : undefined });

  const [showIsolated, setShowIsolated] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  // Each view (studios, videos, studios with chips) has its own arrangement.
  const layoutKey = `${mode}${circles ? "+chips" : ""}`;
  const pins = usePins(layoutKey);
  const { getPins, pinCount } = pins;

  const rootRef = useRef<HTMLDivElement>(null);

  const allNodes = data?.nodes;
  const allEdges = data?.edges;
  const nodesById = useMemo(
    () => new Map((allNodes ?? []).map((node) => [node.id, node])),
    [allNodes],
  );
  const { openProfile, openStudioVideos } = useNetworkNavigation(nodesById);
  const { playing, stopPlaying, play, playAll, playLatest } = useNetworkPlayback();

  const graph = useMemo(
    () => buildGraph({ allNodes, allEdges, hidden, focus, showIsolated, pathEnds }),
    [allNodes, allEdges, showIsolated, hidden, focus, pathEnds],
  );

  // The selection, resolved against what is currently drawn: a performer who
  // has been hidden or filtered away closes their panel rather than lingering.
  const selectedNode =
    selection?.kind === "node" && graph.nodes.some((n) => n.id === selection.id)
      ? nodesById.get(selection.id)
      : undefined;
  const selectedEdge =
    selection?.kind === "edge" ? graph.edges.find((e) => sameEdge(e, selection)) ?? null : null;
  const selectedId = selectedNode?.id ?? null;

  // Studios ranked by how many performers they colour, over everyone rather
  // than whoever is on screen, so colours stay put as you filter.
  const studioColour = useMemo(() => rankStudioColours(allNodes ?? []), [allNodes]);

  // Typing a name dims everyone who doesn't match, before one is picked.
  const searchTerm = search.trim().toLowerCase();
  const searchHits = useMemo(() => {
    if (!searchTerm) return null;
    return new Set(graph.nodes.filter((n) => n.name.toLowerCase().includes(searchTerm)).map((n) => n.id));
  }, [graph.nodes, searchTerm]);

  const {
    containerRef,
    canvasRef,
    minimapRef,
    minimapVisible,
    onMinimapClick,
    simRef,
    viewRef,
    dirtyRef,
    userMovedRef,
    sceneRef,
    centreOn,
    fitAll,
    releaseNode,
    releaseAll,
    reframe,
  } = useNetworkCanvas({
    scene: { graph, hover, selectedId, selectedEdge, discreet, discreetText, nodesById, look, studioColour, searchHits },
    motion,
    getPins,
    setPinCount: pins.setPinCount,
  });

  // --- Interaction ----------------------------------------------------------

  const { hitTest, gesture, onPointerDown, onPointerMove, onPointerUp, onDoubleClick } = useGraphGestures({
    canvasRef,
    containerRef,
    simRef,
    viewRef,
    userMovedRef,
    dirtyRef,
    sceneRef,
    getPins,
    pin: pins.pin,
    hover,
    setHover,
    setSelection,
    closeMenu: () => setMenu(null),
    openProfile,
    openStudioVideos,
  });

  const onSearch = (value: string) => {
    setSearch(value);
    const match = graph.nodes.find((n) => n.name.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      setSelection({ kind: "node", id: match.id });
      centreOn(match.id);
    }
  };

  const selectPerformer = (id: number) => {
    setSelection({ kind: "node", id });
    centreOn(id);
  };
  const toggleFocus = (id: number) => {
    setFocus(focus?.id === id ? null : { id, depth: focus?.depth ?? 1 });
    reframe();
  };
  const hide = (id: number) => {
    if (!hidden.includes(id)) setHidden([...hidden, id]);
    setSelection(null);
    reframe();
  };
  const unhide = (id: number) => {
    setHidden(hidden.filter((h) => h !== id));
    reframe();
  };
  const findPath = (from: number, to: number) => {
    onViewChange({ path: `${from},${to}` });
    setSelection(null);
  };

  // Full screen takes the toolbar along, so everything stays usable there.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
    reframe();
  };

  const unpin = (id: number) => {
    pins.unpin(id);
    releaseNode(id);
  };
  const resetLayout = () => {
    pins.clearPins();
    releaseAll();
    reframe();
  };

  // Right-click: every action for one performer in one place. Full screen
  // hides anything drawn outside the graph, the menu included, so there a
  // right-click opens their panel instead.
  const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit?.kind !== "node") return;
    e.preventDefault();
    const node = nodesById.get(hit.id);
    if (!node) return;
    if (fullscreen) {
      setSelection({ kind: "node", id: node.id });
      return;
    }
    setMenu({
      x: e.clientX,
      y: e.clientY,
      entries: nodeMenuEntries(node, {
        focused: graph.focusId === node.id,
        pinned: Boolean(getPins()[node.id]),
        openProfile: () => openProfile(node.id),
        playLatest: () => void playLatest(node),
        toggleFocus: () => toggleFocus(node.id),
        hide: () => hide(node.id),
        findConnection: () => setSelection({ kind: "node", id: node.id }),
        unpin: () => unpin(node.id),
      }),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) =>
    onGraphKeyDown(e, {
      sim: simRef.current,
      current: selectedNode,
      graph,
      selectPerformer,
      backOut: () => {
        if (menu) setMenu(null);
        else if (selection) setSelection(null);
        else if (pathEnds) onViewChange({ path: undefined });
        else if (focus) setFocus(null);
        else if (search) setSearch("");
      },
      openProfile,
      toggleFocus,
      hide,
    });

  // --- Rendering ------------------------------------------------------------

  const studioCount = graph.nodes.filter((n) => n.kind === "studio").length;
  const performerCount = graph.nodes.length - studioCount;
  const hoveredEdge = hover?.kind === "edge" ? hover.edge : null;
  const totalEdges = allEdges?.length ?? 0;
  const focusedNode = graph.focusId != null ? nodesById.get(graph.focusId) : undefined;
  const loadingMode = fetched != null && fetched.by !== mode;

  // Empty when there is nothing to draw — or only a focused performer on their
  // own, which on its own reads as a glitch rather than as "no links".
  const showEmpty =
    graph.nodes.length === 0 || (graph.edges.length === 0 && !showIsolated);
  const emptyMessage =
    totalEdges > 0 && focusedNode
      ? `${focusedNode.name} has no links here with these filters.`
      : totalEdges > 0
        ? "Nobody left to show with these filters."
        : mode === "studios"
          ? "No two performers have worked for the same studio yet."
          : "No two performers share a video yet. Links appear once a file's name credits more than one performer.";

  // No early return while loading: the canvas has to exist on the first
  // render, or the effects that attach to it (sizing, wheel zoom) run against
  // nothing and never run again.
  const pathNames = graph.path?.map((id) => nodesById.get(id)).filter(Boolean) as
    | NetworkNode[]
    | undefined;
  const pathEndNodes = pathEnds ? pathEnds.map((id) => nodesById.get(id)) : null;

  return (
    <div ref={rootRef} className={cn("space-y-3", fullscreen && "overflow-y-auto bg-background p-4")}>
      <NetworkToolbar
        mode={mode}
        onModeChange={(next) => {
          onViewChange({ by: next === "videos" ? "videos" : undefined });
          setSelection(null);
          reframe();
        }}
        search={search}
        onSearch={onSearch}
        nodes={graph.nodes}
        showIsolated={showIsolated}
        setShowIsolated={setShowIsolated}
        studioCircles={studioCircles}
        onStudioCirclesChange={(show) => {
          onViewChange({ studios: show ? 1 : undefined });
          setSelection(null);
          reframe();
        }}
        performerCount={performerCount}
        studioCount={studioCount}
        linkCount={graph.edges.length}
      />

      <NetworkHighlights
        mode={mode}
        nodes={graph.nodes}
        neighbours={graph.neighbours}
        onSelect={selectPerformer}
      />

      <NetworkFilterChips
        pathEnds={pathEnds}
        pathNames={pathNames}
        pathEndNodes={pathEndNodes}
        onClearPath={() => onViewChange({ path: undefined })}
        focusedNode={focusedNode}
        focusDepth={focus?.depth}
        onFocusDepth={(depth) => {
          if (focus) setFocus({ ...focus, depth });
          reframe();
        }}
        onStopFocus={() => {
          setFocus(null);
          reframe();
        }}
        hidden={hidden}
        nodesById={nodesById}
        onUnhide={unhide}
        onShowEveryone={() => {
          setHidden([]);
          reframe();
        }}
        selectPerformer={selectPerformer}
      />

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn(
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "relative overflow-hidden rounded-xl border border-border",
          fullscreen ? "h-[calc(100dvh-13rem)] min-h-[360px]" : "h-[calc(100dvh-17rem)] min-h-[420px]",
        )}
        style={{ background: STYLE.background }}
      >
        <canvas
          ref={canvasRef}
          className="block touch-none select-none"
          style={{ cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            if (!gesture.current && hover) setHover(null);
          }}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          aria-label="Graph of how performers connect to each other"
          role="img"
        />

        <GraphStatus
          loading={isLoading || loadingMode}
          showEmpty={showEmpty}
          emptyMessage={emptyMessage}
          offerShowEveryone={!showIsolated && (allNodes?.length ?? 0) > 0}
          onShowEveryone={() => setShowIsolated(true)}
        />

        {hoveredEdge && !sameEdge(hoveredEdge, selectedEdge) && (
          <EdgeHoverCard
            mode={mode}
            edge={hoveredEdge}
            a={nodesById.get(hoveredEdge.source)}
            b={nodesById.get(hoveredEdge.target)}
            studioLink={hoveredEdge.source < 0 || hoveredEdge.target < 0}
          />
        )}

        <GraphControls
          onFit={fitAll}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          pinCount={pinCount}
          onResetLayout={resetLayout}
        />

        <canvas
          ref={minimapRef}
          onClick={onMinimapClick}
          title="Click to move there"
          className={cn(
            "absolute bottom-3 right-3 h-[110px] w-[170px] cursor-pointer rounded-md bg-black/55 ring-1 ring-border backdrop-blur-sm transition-opacity",
            minimapVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />

        {hover?.kind === "node" && !selectedNode && nodesById.get(hover.id)?.kind !== "studio" && (
          <NodeHoverCard performer={nodesById.get(hover.id)!} />
        )}

        <SelectionPanels
          mode={mode}
          graph={graph}
          nodesById={nodesById}
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          onClose={() => setSelection(null)}
          openProfile={openProfile}
          toggleFocus={toggleFocus}
          hide={hide}
          selectPerformer={selectPerformer}
          selectPair={(a, b) => setSelection({ kind: "edge", source: a, target: b })}
          openStudioVideos={openStudioVideos}
          play={play}
          playAll={playAll}
          findPath={findPath}
        />
      </div>

      <p className="text-xs text-muted-foreground/70">
        Drag to pan, scroll or pinch to zoom. Click someone for their panel, double-click for their
        profile, right-click for everything else, and click a line to see what links a pair. Drag
        someone to place them and they stay put. With the graph focused, the arrow keys step between
        neighbours, Enter opens, F focuses, H hides and Esc backs out. A red dot marks a favourite.
      </p>

      {playing != null && (
        <MediaDetailModal itemId={playing} autoPlay onClose={stopPlaying} />
      )}
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
