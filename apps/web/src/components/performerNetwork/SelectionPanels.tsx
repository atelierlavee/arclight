import type { NetworkEdge, NetworkMode, NetworkNode, SharedVideo } from "@/lib/performerApi";
import { PairPanel, PerformerPanel, StudioPanel } from "../PerformerNetworkPanels";
import type { NetworkGraph } from "./graph";

/** The side panel for whatever is selected: a studio, a performer, or a pair. */
export function SelectionPanels({
  mode,
  graph,
  nodesById,
  selectedNode,
  selectedEdge,
  onClose,
  openProfile,
  toggleFocus,
  hide,
  selectPerformer,
  selectPair,
  openStudioVideos,
  play,
  playAll,
  findPath,
}: {
  mode: NetworkMode;
  graph: NetworkGraph;
  nodesById: Map<number, NetworkNode>;
  selectedNode: NetworkNode | undefined;
  selectedEdge: NetworkEdge | null;
  onClose: () => void;
  openProfile: (id: number) => void;
  toggleFocus: (id: number) => void;
  hide: (id: number) => void;
  selectPerformer: (id: number) => void;
  selectPair: (a: number, b: number) => void;
  openStudioVideos: (edge: { source: number; target: number }) => void;
  play: (itemId: number) => void;
  playAll: (videos: (SharedVideo & { durationSeconds?: number | null })[]) => void;
  findPath: (from: number, to: number) => void;
}) {
  return (
    <>
      {selectedNode?.kind === "studio" && (
        <StudioPanel
          studio={selectedNode}
          members={graph.neighbours.get(selectedNode.id) ?? []}
          nodesById={nodesById}
          focused={graph.focusId === selectedNode.id}
          onClose={onClose}
          onOpenPage={() => openProfile(selectedNode.id)}
          onFocus={() => toggleFocus(selectedNode.id)}
          onHide={() => hide(selectedNode.id)}
          onSelectPerformer={selectPerformer}
          onPlayAll={playAll}
          onOpenVideos={(performerId) =>
            openStudioVideos({ source: performerId, target: selectedNode.id })
          }
        />
      )}

      {selectedNode && selectedNode.kind !== "studio" && (
        <PerformerPanel
          mode={mode}
          performer={selectedNode}
          neighbours={graph.neighbours.get(selectedNode.id) ?? []}
          nodesById={nodesById}
          focused={graph.focusId === selectedNode.id}
          onClose={onClose}
          onOpenProfile={() => openProfile(selectedNode.id)}
          onFocus={() => toggleFocus(selectedNode.id)}
          onHide={() => hide(selectedNode.id)}
          onSelectPerformer={selectPerformer}
          onSelectPair={(otherId) =>
            otherId < 0
              ? openStudioVideos({ source: selectedNode.id, target: otherId })
              : selectPair(selectedNode.id, otherId)
          }
          onPlay={play}
          connectTo={graph.nodes.filter((n) => n.kind !== "studio" && n.id !== selectedNode.id)}
          onFindPath={(otherId) => findPath(selectedNode.id, otherId)}
        />
      )}

      {selectedEdge && nodesById.get(selectedEdge.source) && nodesById.get(selectedEdge.target) && (
        <PairPanel
          mode={mode}
          edge={selectedEdge}
          a={nodesById.get(selectedEdge.source)!}
          b={nodesById.get(selectedEdge.target)!}
          onClose={onClose}
          onSelectPerformer={selectPerformer}
          onPlayAll={playAll}
        />
      )}
    </>
  );
}
