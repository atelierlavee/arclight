import type { NetworkMode, NetworkNode } from "@/lib/performerApi";
import { cn } from "@/lib/utils";

const MODES: { value: NetworkMode; label: string }[] = [
  { value: "studios", label: "Studios" },
  { value: "videos", label: "Videos together" },
];

/** The row above the graph: mode, search, what to show, and the counts. */
export function NetworkToolbar({
  mode,
  onModeChange,
  search,
  onSearch,
  nodes,
  showIsolated,
  setShowIsolated,
  studioCircles,
  onStudioCirclesChange,
  performerCount,
  studioCount,
  linkCount,
}: {
  mode: NetworkMode;
  onModeChange: (mode: NetworkMode) => void;
  search: string;
  onSearch: (value: string) => void;
  /** Everyone drawn, offered as search suggestions. */
  nodes: NetworkNode[];
  showIsolated: boolean;
  setShowIsolated: (show: boolean) => void;
  studioCircles: boolean;
  onStudioCirclesChange: (show: boolean) => void;
  performerCount: number;
  studioCount: number;
  linkCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Connect by</span>
        <div className="flex rounded-md bg-secondary p-0.5" role="group" aria-label="Connect by">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              onClick={() => {
                if (option.value === mode) return;
                onModeChange(option.value);
              }}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                mode === option.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <input
        type="search"
        list="performer-network-names"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Find a performer"
        className="h-8 w-48 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
      />
      <datalist id="performer-network-names">
        {nodes.map((node) => (
          <option key={node.id} value={node.name} />
        ))}
      </datalist>

      <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
        <input
          type="checkbox"
          checked={showIsolated}
          onChange={(e) => setShowIsolated(e.target.checked)}
          className="accent-foreground"
        />
        Show performers with no connections
      </label>

      {mode === "studios" && (
        <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            checked={studioCircles}
            onChange={(e) => onStudioCirclesChange(e.target.checked)}
            className="accent-foreground"
          />
          Show studios in the graph
        </label>
      )}

      <span className="text-xs text-muted-foreground/70 md:ml-auto">
        {performerCount} {performerCount === 1 ? "performer" : "performers"} ·{" "}
        {studioCount > 0 && <>{studioCount} {studioCount === 1 ? "studio" : "studios"} · </>}
        {linkCount}{" "}
        {linkCount === 1 ? "link" : "links"}
      </span>
    </div>
  );
}
