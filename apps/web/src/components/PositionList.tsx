import { useState } from "react";
import { Check, Plus, Search, Trash2, X } from "lucide-react";
import { formatTimestamp } from "@/lib/bookmarkApi";
import { layoutMarkers, markerColor, useMarkerMutations, useTpdbStatus, type Marker } from "@/lib/markerApi";
import { useIsOwner } from "@/lib/profile";
import { TpdbMarkersDialog } from "./TpdbMarkersDialog";

/**
 * The video's positions, in playback order, each a jump to where it starts.
 *
 * Everyone can read and jump; the owner can also fetch them from ThePornDB,
 * add one at the current moment, rename and delete. A renamed or added one is
 * the owner's: a later fetch leaves it alone.
 */
export function PositionList({
  itemId,
  durationSeconds,
  markers,
  currentTime,
  onJump,
}: {
  itemId: number;
  durationSeconds: number | null;
  markers: Marker[];
  /** Where playback is, for "add here"; null when nothing is playing. */
  currentTime: () => number | null;
  onJump: (seconds: number) => void;
}) {
  const isOwner = useIsOwner();
  const { data: tpdb } = useTpdbStatus(isOwner);
  const { add, update, remove } = useMarkerMutations(itemId);
  const [finding, setFinding] = useState(false);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState("");
  const [newAt, setNewAt] = useState(0);

  // Ends as the seek bar draws them, so "runs to the next one" reads the same here.
  const ends = new Map(
    layoutMarkers(markers, durationSeconds ?? Number.MAX_SAFE_INTEGER).map((s) => [s.marker.id, s.end]),
  );

  function save() {
    const title = draft.trim();
    if (title && editingId === "new") add.mutate({ title, startSeconds: newAt });
    else if (title && typeof editingId === "number") update.mutate({ id: editingId, title });
    setEditingId(null);
  }

  const editor = (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <input
        autoFocus
        value={draft}
        placeholder="Position name"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") setEditingId(null);
          event.stopPropagation();
        }}
        className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs"
      />
      <button type="button" onClick={save} className="text-muted-foreground hover:text-foreground" title="Save">
        <Check className="size-3.5" />
      </button>
      <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground" title="Cancel">
        <X className="size-3.5" />
      </button>
    </span>
  );

  return (
    <div className="space-y-1.5">
      {markers.length === 0 && editingId !== "new" && (
        <p className="text-xs text-muted-foreground">
          {isOwner
            ? tpdb?.configured
              ? "None yet. Find them on ThePornDB, or add one where the video is now."
              : "None yet. Add one where the video is now, or set TPDB_API_KEY on the server to fetch them from ThePornDB."
            : "None yet."}
        </p>
      )}

      {markers.length > 0 && (
        <ul className="space-y-0.5">
          {markers.map((marker) => {
            const end = ends.get(marker.id);
            return (
              <li key={marker.id} className="group flex items-center gap-2 text-xs">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: markerColor(marker.title) }}
                />
                <button
                  type="button"
                  onClick={() => onJump(marker.startSeconds)}
                  className="shrink-0 tabular-nums text-muted-foreground hover:text-foreground"
                  title="Play from here"
                >
                  {formatTimestamp(marker.startSeconds)}
                  {end != null && end !== Number.MAX_SAFE_INTEGER && `–${formatTimestamp(end)}`}
                </button>
                {editingId === marker.id ? (
                  editor
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isOwner) return onJump(marker.startSeconds);
                      setDraft(marker.title);
                      setEditingId(marker.id);
                    }}
                    className="min-w-0 flex-1 truncate text-left font-medium"
                    title={isOwner ? "Rename" : "Play from here"}
                  >
                    {marker.title}
                  </button>
                )}
                {isOwner && editingId !== marker.id && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(marker.id)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editingId === "new" && (
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 tabular-nums text-muted-foreground">{formatTimestamp(newAt)}</span>
          {editor}
        </div>
      )}

      {isOwner && (
        <div className="flex flex-wrap gap-3 pt-0.5 text-xs">
          {tpdb?.configured && (
            <button
              type="button"
              onClick={() => setFinding(true)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <Search className="size-3.5" /> Find on ThePornDB
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setNewAt(Math.floor(currentTime() ?? 0));
              setDraft("");
              setEditingId("new");
            }}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3.5" /> Add where the video is now
          </button>
        </div>
      )}

      {finding && <TpdbMarkersDialog itemId={itemId} onClose={() => setFinding(false)} />}
    </div>
  );
}
