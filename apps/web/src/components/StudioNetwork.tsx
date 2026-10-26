import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { EditDialog, SaveButton } from "./EditDialog";
import { EDIT_INPUT } from "@/lib/editForm";
import { fetchStudios, saveStudio, type StudioDetail, type StudioSummary } from "@/lib/studioApi";
import { qk } from "@/lib/queryKeys";
import { useIsOwner } from "@/lib/profile";

const chip =
  "sensitive rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-accent";

/**
 * Where a studio sits: the network above it and the sites under it. Says
 * nothing at all for a studio with neither, apart from the owner's edit link.
 */
export function StudioNetwork({ studio }: { studio: StudioDetail }) {
  const [editing, setEditing] = useState(false);
  const isOwner = useIsOwner();
  const empty = !studio.parent && studio.sites.length === 0;
  if (empty && !isOwner) return null;

  return (
    <div className="space-y-2 text-sm">
      {studio.parent && (
        <p className="text-muted-foreground">
          Part of{" "}
          <Link
            to="/studio/$studioId"
            params={{ studioId: String(studio.parent.id) }}
            className="sensitive text-foreground hover:underline"
          >
            {studio.parent.name}
          </Link>
        </p>
      )}
      {studio.sites.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-muted-foreground">Sites</span>
          {studio.sites.map((site) => (
            <Link key={site.id} to="/studio/$studioId" params={{ studioId: String(site.id) }} className={chip}>
              {site.name}
            </Link>
          ))}
        </div>
      )}
      {isOwner && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Pencil className="size-3" />
          {empty ? "Add to a network" : "Edit network"}
        </button>
      )}
      {editing && <StudioEditDialog studio={studio} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Every studio below `id`, not including it. */
function sitesUnder(studios: StudioSummary[], id: number): Set<number> {
  const below = new Set<number>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const studio of studios) {
      if (studio.parentId === current && !below.has(studio.id)) {
        below.add(studio.id);
        queue.push(studio.id);
      }
    }
  }
  return below;
}

function StudioEditDialog({ studio, onClose }: { studio: StudioDetail; onClose: () => void }) {
  const [parentId, setParentId] = useState(studio.parent ? String(studio.parent.id) : "");
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: qk.studios.all, queryFn: fetchStudios });

  // Itself and its own sites would make a loop, so they are not offered.
  const below = sitesUnder(data?.studios ?? [], studio.id);
  const choices = (data?.studios ?? [])
    .filter((other) => other.id !== studio.id && !below.has(other.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const save = useMutation({
    mutationFn: () =>
      saveStudio(studio.id, {
        parentId: parentId ? Number(parentId) : null,
      }),
    onSuccess: () => {
      // Both pages change — this one and the network's — and every card.
      queryClient.invalidateQueries({ queryKey: qk.studio.all });
      queryClient.invalidateQueries({ queryKey: qk.studios.all });
      queryClient.invalidateQueries({ queryKey: qk.mediaItems.all });
      onClose();
    },
  });

  return (
    <EditDialog
      title={
        <>
          Edit <span className="sensitive">{studio.name}</span>
        </>
      }
      onClose={onClose}
    >
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Part of network</span>
        <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={EDIT_INPUT}>
          <option value="">None</option>
          {choices.map((other) => (
            <option key={other.id} value={other.id}>
              {other.name}
            </option>
          ))}
        </select>
        <span className="block text-[11px] text-muted-foreground/70">
          The network&rsquo;s page and filters include this studio&rsquo;s videos. No network listed?
          Create one with &ldquo;New network&rdquo; on the Studios page.
        </span>
      </label>

      {save.error && <p className="text-xs text-destructive">{save.error.message}</p>}
      <SaveButton onClick={() => save.mutate()} disabled={save.isPending} />
    </EditDialog>
  );
}
