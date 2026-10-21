import { X } from "lucide-react";
import type { NetworkNode } from "@/lib/performerApi";
import { cn } from "@/lib/utils";

/**
 * The view's narrowing, as chips you can undo: a traced connection, a
 * focus and its depth, and whoever has been hidden.
 */
export function NetworkFilterChips({
  pathEnds,
  pathNames,
  pathEndNodes,
  onClearPath,
  focusedNode,
  focusDepth,
  onFocusDepth,
  onStopFocus,
  hidden,
  nodesById,
  onUnhide,
  onShowEveryone,
  selectPerformer,
}: {
  pathEnds: readonly [number, number] | null;
  /** The traced connection, end to end; undefined when there is none. */
  pathNames: NetworkNode[] | undefined;
  pathEndNodes: (NetworkNode | undefined)[] | null;
  onClearPath: () => void;
  focusedNode: NetworkNode | undefined;
  focusDepth: 1 | 2 | undefined;
  onFocusDepth: (depth: 1 | 2) => void;
  onStopFocus: () => void;
  hidden: number[];
  nodesById: Map<number, NetworkNode>;
  onUnhide: (id: number) => void;
  onShowEveryone: () => void;
  selectPerformer: (id: number) => void;
}) {
  if (!(focusedNode || hidden.length > 0 || pathEnds)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {pathEnds && (
        <span className="flex flex-wrap items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1">
          {pathNames ? (
            <>
              Connection:
              {pathNames.map((node, i) => (
                <span key={node.id} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground">→</span>}
                  <button
                    type="button"
                    onClick={() => selectPerformer(node.id)}
                    className="sensitive font-medium hover:underline"
                  >
                    {node.name}
                  </button>
                </span>
              ))}
              <span className="text-muted-foreground">
                · {pathNames.length - 1} {pathNames.length === 2 ? "step" : "steps"}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              No connection between{" "}
              <span className="sensitive text-foreground">{pathEndNodes?.[0]?.name ?? "them"}</span> and{" "}
              <span className="sensitive text-foreground">{pathEndNodes?.[1]?.name ?? "them"}</span> with these
              filters
            </span>
          )}
          <button
            type="button"
            onClick={onClearPath}
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear the connection"
          >
            <X className="size-3" />
          </button>
        </span>
      )}
      {focusedNode && (
        <span className="flex items-center gap-1.5 rounded-full bg-secondary py-0.5 pl-2.5 pr-1">
          Focused on <span className="sensitive font-medium">{focusedNode.name}</span>
          <span className="flex rounded-full bg-background/60 p-0.5">
            {([1, 2] as const).map((depth) => (
              <button
                key={depth}
                type="button"
                aria-pressed={focusDepth === depth}
                onClick={() => onFocusDepth(depth)}
                className={cn(
                  "rounded-full px-1.5",
                  focusDepth === depth ? "bg-foreground text-background" : "text-muted-foreground",
                )}
                title={depth === 1 ? "Their direct connections" : "And their connections' connections"}
              >
                {depth === 1 ? "1 step" : "2 steps"}
              </button>
            ))}
          </span>
          <button
            type="button"
            onClick={onStopFocus}
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Stop focusing"
          >
            <X className="size-3" />
          </button>
        </span>
      )}
      {hidden.length > 0 && <span className="text-muted-foreground">Hidden:</span>}
      {hidden.map((id) => (
        <span key={id} className="flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1">
          <span className="sensitive">{nodesById.get(id)?.name ?? "Unknown"}</span>
          <button
            type="button"
            onClick={() => onUnhide(id)}
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Show again"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {hidden.length > 1 && (
        <button
          type="button"
          onClick={onShowEveryone}
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Show everyone
        </button>
      )}
    </div>
  );
}
