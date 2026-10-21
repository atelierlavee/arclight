import { STYLE } from "./style";

/** Over the graph: "Loading…" while a mode loads, or why there's nothing to draw. */
export function GraphStatus({
  loading,
  showEmpty,
  emptyMessage,
  offerShowEveryone,
  onShowEveryone,
}: {
  loading: boolean;
  showEmpty: boolean;
  emptyMessage: string;
  offerShowEveryone: boolean;
  onShowEveryone: () => void;
}) {
  return (
    <>
      {loading && (
        <p className="pointer-events-none absolute left-3 top-3 rounded-md bg-popover/90 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-border">
          Loading…
        </p>
      )}

      {!loading && showEmpty && (
        // Opaque, so a lone focused performer doesn't show through the text.
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
          style={{ background: STYLE.background }}
        >
          <p className="max-w-sm text-sm text-muted-foreground">{emptyMessage}</p>
          {offerShowEveryone && (
            <button
              type="button"
              onClick={onShowEveryone}
              className="rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent"
            >
              Show everyone anyway
            </button>
          )}
        </div>
      )}
    </>
  );
}
